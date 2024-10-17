package main

import (
	"encoding/json"
	"errors"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
)

// Offer struct
type Offer struct {
	Type string `json:"type"`
	Sdp  string `json:"sdp"`
}

// Answer struct
type Answer struct {
	Type string `json:"type"`
	Sdp  string `json:"sdp"`
}

// Candidate struct
type Candidate struct {
	Candidate     string `json:"candidate"`
	SdpMid        string `json:"sdpMid"`
	SdpMLineIndex int    `json:"sdpMLineIndex"`
}

// SignalMessage template to establish connection
type SignalMessage struct {
	Type      string     `json:"type,omitempty"`
	Name      string     `json:"name,omitempty"`
	Offer     *Offer     `json:"offer,omitempty"`
	Answer    *Answer    `json:"answer,omitempty"`
	Candidate *Candidate `json:"candidate,omitempty"`
}

// DefaultError template
type DefaultError struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

// Handler is a HTTP handler function that upgrades the HTTP request to a WebSocket connection,
// routes WebSocket messages and manages the connection lifecycle.
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

// connHandler is the handler for incoming messages from WebSocket connections.
// Messages from the client are parsed and then routed to the appropriate event handler based on type.
//
// Parameters:
// - connection: A WebSocket connection to a single client.
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
	case "login":
		err = ss.loginEvent(connection, message)
	case "offer":
		err = ss.offerEvent(connection, message)
	case "answer":
		err = ss.answerEvent(connection, message)
	case "candidate":
		err = ss.candidateEvent(connection, message)
	case "leave":
		err = ss.leaveEvent(connection)
	case "roomAvailability":
		err = ss.roomAvailabilityEvent(connection, message)
	default:
		err = unknownCommandEvent(connection, raw)
	}

	// Return any errors from the event handlers
	if err != nil {
		return err
	}

	return nil
}

// offerEvent forwards an offer to a remote peer
func (ss *SignalingServer) offerEvent(conn *websocket.Conn, data SignalMessage) error {
	var sm SignalMessage

	author := ss.UserFromConn(conn)
	if author == nil {
		return errors.New("unregistered author")
	}

	peer := ss.UserFromName(data.Name)
	if peer == nil {
		return errors.New("unknown peer")
	}

	err := ss.UpdatePeer(author.Name, peer.Name)
	if err != nil {
		return err
	}

	sm.Name = author.Name
	sm.Offer = data.Offer
	sm.Type = "offer"
	out, err := json.Marshal(sm)
	if err != nil {
		return err
	}

	if err = peer.Conn.WriteMessage(websocket.TextMessage, out); err != nil {
		return err
	}

	return nil
}

// Forwards Answer to original peer.
func (ss *SignalingServer) answerEvent(conn *websocket.Conn, data SignalMessage) error {
	var sm SignalMessage

	author := ss.UserFromConn(conn)
	if author == nil {
		return errors.New("unregistered author")
	}

	peer := ss.UserFromName(data.Name)
	if peer == nil {
		return errors.New("unknown requested peer")
	}

	if err := ss.UpdatePeer(author.Name, data.Name); err != nil {
		return err
	}

	sm.Answer = data.Answer
	sm.Type = "answer"
	out, err := json.Marshal(sm)
	if err != nil {
		return err
	}

	if err = peer.Conn.WriteMessage(websocket.TextMessage, out); err != nil {
		return err
	}

	return nil
}

// Forwards candidate to original peer.
func (ss *SignalingServer) candidateEvent(conn *websocket.Conn, data SignalMessage) error {
	var sm SignalMessage

	author := ss.UserFromConn(conn)
	if author == nil {
		return errors.New("unregistered connection")
	}

	peer := ss.UserFromName(data.Name)
	if peer == nil {
		return errors.New("unregistered peer")
	}

	sm.Candidate = data.Candidate
	sm.Type = "candidate"
	out, err := json.Marshal(sm)
	if err != nil {
		return err
	}

	if err = peer.Conn.WriteMessage(websocket.TextMessage, out); err != nil {
		return err
	}

	return nil
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

// TODO NEW LOGIN
func (ss *SignalingServer) loginEvent(conn *websocket.Conn, data SignalMessage) error {
	author := ss.UserFromName(data.Name)
	if author != nil {
		return nil
	}

	ss.AddUser(conn, data.Name)
	type LoginResponse struct {
		Type    string `json:"type"`
		Success bool   `json:"success"`
	}
	out, err := json.Marshal(LoginResponse{Type: "login", Success: true})
	if err != nil {
		return err
	}

	err = conn.WriteMessage(websocket.TextMessage, out)
	if err != nil {
		return err
	}

	type Users struct {
		Type  string   `json:"type"`
		Users []string `json:"users"`
	}
	out, err = json.Marshal(Users{Type: "users", Users: ss.AllUserNames()})
	if err != nil {
		return err
	}

	ss.NotifyUsers(func(user *User) {
		user.Conn.WriteMessage(websocket.TextMessage, out)
	})

	return nil
}

// HandlerEvent that checks whether a room exists with the given roomCode.
// NOTE: Currently, roomCode == owner name.
// No room implementation yet but should be easy to change peer to UserFromRoom etc
func (ss *SignalingServer) roomAvailabilityEvent(conn *websocket.Conn, data SignalMessage) error {
	type RoomAvailabilityResponse struct {
		Type    string `json:"type"`
		Success bool   `json:"success"`
		Error   string `json:"error,omitempty"`
	}

	owner := ss.UserFromName(data.Name)

	var response RoomAvailabilityResponse
	response.Type = "roomAvailability"
	if owner != nil {
		response.Success = true
	} else {
		response.Success = false
	}

	out, err := json.Marshal(response)
	if err != nil {
		return err
	}

	// Send the room availability result back to the client
	err = conn.WriteMessage(websocket.TextMessage, out)
	if err != nil {
		return err
	}

	return nil
}

// unknownCommandEvent is the handler for messages that do not follow the SignalMessage template.
// Returns an error message.
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
	err = conn.WriteMessage(websocket.TextMessage, out)
	if err != nil {
		return err
	}

	return nil
}
