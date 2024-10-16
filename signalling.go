package main

import (
	"encoding/json"
	"errors"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
)

// Offer message
type Offer struct {
	Type string `json:"type"`
	Sdp  string `json:"sdp"`
}

// Answer message
type Answer struct {
	Type string `json:"type"`
	Sdp  string `json:"sdp"`
}

// Candidate message
type Candidate struct {
	Candidate     string `json:"candidate"`
	SdpMid        string `json:"sdpMid"`
	SdpMLineIndex int    `json:"sdpMLineIndex"`
}

// SignalMessage template for sending connection messages
type SignalMessage struct {
	Type      string     `json:"type,omitempty"`
	Name      string     `json:"name,omitempty"`
	RoomCode  string     `json:"roomCode,omitempty"`
	Offer     *Offer     `json:"offer,omitempty"`
	Answer    *Answer    `json:"answer,omitempty"`
	Candidate *Candidate `json:"candidate,omitempty"`
}

// Handler is a HTTP handler function that upgrades the HTTP request to a WebSocket connection
// and manages WebSocket messages and connection lifecycle.
func (ss *SignalingServer) Handler(c echo.Context) error {

	ws, err := ss.upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	// A WebSocket connection is established
	c.Logger().Debugf("%v accesses the server", ws.RemoteAddr())
	// A loop to handle events/messages for this WebSocket connection
	for {
		// Call the connHandler method to process the messages
		err := ss.connHandler(ws)
		// Handle possible errors
		if err != nil {
			// Client closed the browser
			if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				user := ss.UserFromConn(ws)
				if user == nil {
					c.Logger().Debugf("Connection closed for %v", ws.RemoteAddr())
				} else {
					ss.leaveEvent(ws)
					c.Logger().Debugf("Connection closed for user %v", user.Name)
				}
				return nil
			}
			// Connection closed unexpectedly
			if websocket.IsUnexpectedCloseError(err) {
				c.Logger().Errorf("Unexpected WebSocket closure for %v: %v", ws.RemoteAddr(), err)
				return err
			}

			// Log any other errors
			c.Logger().Errorf("Error occurred while handling WebSocket connection: %v", err)
			return err
		}
	}
}

// connHandler is the handler for incoming WebSocket connections.
// Messages from the client are parsed and then routed to the appropriate event handler based on type.
//
// Parameters:
// - connection: A WebSocket connection to the client.
//
// Returns an error if there are any issues processing the message.
func (ss *SignalingServer) connHandler(connection *websocket.Conn) error {

	var message SignalMessage

	//Read the next message from the WebSocket connection
	_, raw, err := connection.ReadMessage()
	if err != nil {
		return err
	}

	// Convert JSON to SignalMessage Struct data with Unmarshal.
	err = json.Unmarshal(raw, &message)
	if err != nil {
		// If error, Marshal the DefaultError to JSON
		response, err := json.Marshal(DefaultError{Type: "error", Message: "Incorrect data format"})
		if err != nil {
			return err
		}
		err = connection.WriteMessage(websocket.TextMessage, response)
		if err != nil {
			return err
		}
		return nil
	}

	// Handle different message types
	switch message.Type {
	case "createRoom":
		err = ss.createRoom(connection, message)
	case "joinRoom":
		err = ss.joinRoom(connection, message)
	case "leave":
		err = ss.leaveEvent(connection)
	default:
		err = unknownCommandEvent(connection, raw)
	}

	// Return any errors from the event handlers
	if err != nil {
		return err
	}

	return nil
}

// For handling the createRoom message. The room's creator is now waiting to connect with participant.
func (ss *SignalingServer) createRoom(conn *websocket.Conn, data SignalMessage) error {

	if data.Name == "" {
		return errors.New("username required")
	}

	creator := ss.UserFromName(data.Name)
	if creator != nil {
		return nil
	}

	ss.AddUser(conn, data.Name)
	type LoginResponse struct {
		Type     string `json:"type"`
		Success  bool   `json:"success"`
		RoomCode string `json:"roomCode"`
	}

	response, err := json.Marshal(LoginResponse{Type: "createRoom", Success: true, RoomCode: data.Name})
	if err != nil {
		return err
	}

	err = conn.WriteMessage(websocket.TextMessage, response)
	if err != nil {
		return err
	}

	return nil
}

// For handling the joinRoom message.
// 1. The participant logins
// 2. The server forwards an offer from the participant to the room creator.
// 5. The creator sends an answer back to the participant.
// 6. ICE candidate messages are exchanged to establish the connection.
func (ss *SignalingServer) joinRoom(conn *websocket.Conn, data SignalMessage) error {
	if data.Name == "" {
		return errors.New("username required")
	}
	ss.AddUser(conn, data.Name)
	participant := ss.UserFromConn(conn)
	if participant == nil {
		return errors.New("unregistered participant")
	}

	creator := ss.UserFromName(data.Name)
	if creator == nil {
		return errors.New("unknown peer (room creator)")
	}

	err := ss.UpdatePeer(participant.Name, creator.Name)
	if err != nil {
		return err
	}

	// Forward the offer from the participant to the room creator
	var sm SignalMessage
	sm.Name = participant.Name
	sm.Offer = data.Offer
	sm.Type = "offer"
	out, err := json.Marshal(sm)
	if err != nil {
		return err
	}

	// Send the offer to the room creator
	err = creator.Conn.WriteMessage(websocket.TextMessage, out)
	if err != nil {
		return err
	}

	// Wait for the answer from the creator and forward it back to the participant
	for {
		_, raw, err := creator.Conn.ReadMessage()
		if err != nil {
			return err
		}

		// Unmarshal the incoming message to check its type
		err = json.Unmarshal(raw, &sm)
		if err != nil {
			return err
		}

		// If the creator sent an answer, forward it to the participant
		if sm.Type == "answer" {
			// Forward the answer to the participant
			err = conn.WriteMessage(websocket.TextMessage, raw)
			if err != nil {
				return err
			}
			break
		}
	}

	// Asynchronous Goroutine
	go ss.handleCandidateExchange(conn, creator.Conn)

	return nil
}

func (ss *SignalingServer) handleCandidateExchange(conn, creatorConn *websocket.Conn) {
	for {
		// Read the participant's ICE candidate
		_, raw, err := conn.ReadMessage()
		if err != nil {
			// Close the connection if reading fails (e.g., participant leaves or other error)
			conn.Close()
			creatorConn.Close()
			return
		}

		// Check for a "null" or final ICE candidate
		var candidate SignalMessage
		err = json.Unmarshal(raw, &candidate)
		if err == nil && candidate.Candidate == nil {
			// Close the connections when the final ICE candidate is received
			conn.Close()
			creatorConn.Close()
			return
		}

		// Forward the ICE candidate to the room creator
		err = creatorConn.WriteMessage(websocket.TextMessage, raw)
		if err != nil {
			conn.Close()
			creatorConn.Close()
			return
		}

		// Read the creator's ICE candidate
		_, raw, err = creatorConn.ReadMessage()
		if err != nil {
			// Close the connection if reading fails (e.g., creator leaves)
			conn.Close()
			creatorConn.Close()
			conn.Close()
			creatorConn.Close()
			return
		}

		// Check for a "null" or final ICE candidate from the creator
		err = json.Unmarshal(raw, &candidate)
		if err == nil && candidate.Candidate == nil {
			// Gracefully close the connection when the final ICE candidate is received
			conn.Close()
			creatorConn.Close()
			return
		}

		// Forward the ICE candidate to the participant
		err = conn.WriteMessage(websocket.TextMessage, raw)
		if err != nil {
			conn.Close()
			creatorConn.Close()
			return
		}
	}
}

// LeaveEvent terminates a connection. (example: client closed the browser)
func (ss *SignalingServer) leaveEvent(conn *websocket.Conn) error {
	defer conn.Close()

	if peerConn := ss.PeerFromConn(conn); peerConn != nil {
		var out []byte

		type Leaving struct {
			Type string `json:"type"`
		}
		out, err := json.Marshal(Leaving{Type: "leaving"})
		if err != nil {
			return err
		}

		err = peerConn.WriteMessage(websocket.TextMessage, out)
		if err != nil {
			return err
		}
	}

	return nil
}

type DefaultError struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

func unknownCommandEvent(conn *websocket.Conn, raw []byte) error {
	var out []byte
	var message SignalMessage

	err := json.Unmarshal(raw, &message)
	if err != nil {
		return err
	}

	out, err = json.Marshal(DefaultError{Type: "error", Message: "Unrecognized command"})
	if err != nil {
		return err
	}

	if err = conn.WriteMessage(websocket.TextMessage, out); err != nil {
		return err
	}

	return nil
}
