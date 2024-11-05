package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"

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
	RoomID    string     `json:"room_id,omitempty"`
	Name      string     `json:"name,omitempty"`
	Offer     *Offer     `json:"offer,omitempty"`
	Answer    *Answer    `json:"answer,omitempty"`
	Candidate *Candidate `json:"candidate,omitempty"`
	Role      string     `json:"role,omitempty"`
}

// DefaultError template
type Response struct {
	Type    string `json:"type"`
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
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
				ss.leaveEvent(ws)
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
		response, err := json.Marshal(Response{Type: "error", Success: false, Message: "Incorrect data format"})
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
	case "initiation":
		err = ss.initiationEvent(connection, message)
	case "roomInitiation":
		err = ss.roomInitiationEvent(connection, message)
	case "offer":
		err = ss.offerConnectionEvent(connection, message)
	case "answer":
		err = ss.answerConnectionEvent(connection, message)
	case "candidate":
		err = ss.candidateExchangingEvent(connection, message)
	case "leaveRoom":
		err = ss.leaveEvent(connection)
	default:
		err = unknownCommandEvent(connection, raw)
	}

	// Return any errors from the event handlers
	if err != nil {
		_ = sendError(connection, err.Error())
		return err
	}

	return nil
}

// Handler that retrieves the offerSender from the given connection, then finds the offerReceiver using the Name field.
// The offerReceiver is assigned to the user, and then the offer is forwarded to the offerReceiver via their connection.
func (ss *SignalingServer) offerConnectionEvent(conn *websocket.Conn, data SignalMessage) error {
	var sm SignalMessage

	// Get the offerSender of this connection
	offerSender := ss.UserFromConn(conn)
	if offerSender == nil {
		return errors.New("the offer sender does not exist")
	}

	// Get the offerReceiver specified by the Name
	offerReceiver := ss.UserFromName(data.Name)
	if offerReceiver == nil {
		return errors.New("the offer receiver does not exist")
	}

	// Assign the offerReceiver as a peer to offerSender
	err := ss.UpdatePeer(offerSender.Name, offerReceiver.Name)
	if err != nil {
		return err
	}

	sm.Name = offerSender.Name
	sm.Offer = data.Offer
	sm.Type = "offer"
	out, err := json.Marshal(sm)
	if err != nil {
		return err
	}

	// Forward the offer message to the offerReceiver
	err = offerReceiver.Conn.WriteMessage(websocket.TextMessage, out)
	if err != nil {
		return err
	}

	return nil
}

// Handler that forwards an answer to the original user who sent an offer.
// It retrieves the peer from this connection, then finds the original user using the Name field.
// It updates the peer information for the peer and forwards the answer to the original user.
func (ss *SignalingServer) answerConnectionEvent(conn *websocket.Conn, data SignalMessage) error {
	var sm SignalMessage

	// Get the answerSender (the receiver of the offer)
	answerSender := ss.UserFromConn(conn)
	if answerSender == nil {
		return errors.New("the answer sender does not exist")
	}

	// Get the answerReceiver (the sender of the offer)
	answerReceiver := ss.UserFromName(data.Name)
	if answerReceiver == nil {
		return errors.New("the answer receiver does not exist")
	}

	// Assign the answerReceiver as a peer to answerSender
	err := ss.UpdatePeer(answerSender.Name, data.Name)
	if err != nil {
		return err
	}

	sm.Answer = data.Answer
	sm.Type = "answer"
	out, err := json.Marshal(sm)
	if err != nil {
		return err
	}

	// Forward the answer to the answerReceiver
	err = answerReceiver.Conn.WriteMessage(websocket.TextMessage, out)
	if err != nil {
		return err
	}

	return nil
}

// Handler that forwards ICE candidates between peers.
// It retrieves the candidateSender, finds the candidateReceiver by Name field, and forwards the cancidate to the candidateReceiver.
func (ss *SignalingServer) candidateExchangingEvent(conn *websocket.Conn, data SignalMessage) error {
	var sm SignalMessage

	candidateSender := ss.UserFromConn(conn)
	if candidateSender == nil {
		return errors.New("the candidate sender does not exist")
	}
	room, err := ss.rooms.GetFirstRoomWithUser(candidateSender)
	if err != nil {
		return err
	}
	log.Println(fmt.Sprintf("Found room with id '%s' where user '%s' is in", room.ID, candidateSender.Name))

	for i := 0; i < len(room.Users); i++ {
		var user = room.Users[i]
		if user == candidateSender {
			continue
		}

		candidateReceiver := ss.UserFromName(data.Name)
		if candidateReceiver == nil {
			return errors.New("the candidate receiver does not exist")
		}

		sm.Candidate = data.Candidate
		sm.Type = "candidate"
		out, err := json.Marshal(sm)
		if err != nil {
			return err
		}

		// Forward the candidate
		err = candidateReceiver.Conn.WriteMessage(websocket.TextMessage, out)
		if err != nil {
			return err
		}

		log.Println(fmt.Sprintf("Sent message '%s' from '%s' to reciever '%s'", room.ID, candidateSender.Name, candidateReceiver.Name))
	}

	return nil
}

// Handler for terminating a connection. (example: client closed the browser)
// It retrieves the peer associated with the user leaving the connection,
// and if a peer exists, it notifies the peer that the user has left by sending a "leaving" message.
// Removes the user from the server.
func (ss *SignalingServer) leaveEvent(conn *websocket.Conn) error {
	defer conn.Close()
	peerConn := ss.PeerFromConn(conn)
	if peerConn != nil {
		var out []byte

		type Leaving struct {
			Type string `json:"type"`
		}
		out, err := json.Marshal(Leaving{Type: "peerLeavingRoom"})
		if err != nil {
			return err
		}

		// Notify the peer of the leaving user
		err = peerConn.WriteMessage(websocket.TextMessage, out)
		if err != nil {
			return err
		}

		user := ss.UserFromConn(conn)
		if user != nil {
			// Remove the peer reference user who is left alone
			err := ss.RemovePeerForUser(user.Name)
			if err != nil {
				return err
			}
		}
	}

	// Remove the user from the list of connected users
	err := ss.RemoveUser(conn)
	if err != nil {
		return err
	}

	return nil
}

// The initiationEvent handler. Given a connection and a SignalMessage containing the role,
// we add the user and create a room if necessary.
func (ss *SignalingServer) initiationEvent(conn *websocket.Conn, data SignalMessage) error {
	log.Println(fmt.Sprintf("Initiation event name '%s'", data.Name))
	user := ss.UserFromName(data.Name)
	if user != nil {
		return nil
	}

	ss.AddUser(conn, data.Name)

	//Write the response
	out, err := json.Marshal(Response{Type: "initiation", Success: true})
	if err != nil {
		return err
	}

	err = conn.WriteMessage(websocket.TextMessage, out)
	if err != nil {
		return err
	}

	return nil
}

func sendError(conn *websocket.Conn, message string) error {
	response, err := json.Marshal(Response{Type: "error", Success: false, Message: message})
	if err != nil {
		return err
	}
	err = conn.WriteMessage(websocket.TextMessage, response)
	if err != nil {
		return err
	}
	return nil
}

// The room initiation event handler.
func (ss *SignalingServer) roomInitiationEvent(conn *websocket.Conn, data SignalMessage) error {
	user := ss.UserFromConn(conn)
	if user == nil {
		return errors.New("user does not exist yet")
	}

	switch data.Role {
	case "creator":
		_, err := ss.rooms.Create(user, data.RoomID)
		if err != nil {
			return err
		}
		log.Println(fmt.Sprintf("Created a room with user '%s'", user.Name))
	case "participant":
		err := ss.rooms.Join(data.RoomID, user)
		if err != nil {
			return err
		}
		log.Println(fmt.Sprintf("Added user '%s' to room with id '%s'", user.Name, data.Name))
	default:
		err := sendError(conn, "Invalid role")
		if err != nil {
			return err
		}
		return nil
	}

	room, err := ss.rooms.GetFirstRoomWithUser(user)
	if err != nil {
		return err
	}
	if room == nil {
		return errors.New("could not find room")
	}

	participants := make([]string, len(room.Users))
	for i, user := range room.Users {
		participants[i] = user.Name
	}

	type RoomResponse struct {
		Type         string   `json:"type"`
		Success      bool     `json:"success"`
		RoomID       string   `json:"room_id"`
		Participants []string `json:"participants"`
		Message      string   `json:"message,omitempty"`
	}

	//Write the response
	out, err := json.Marshal(RoomResponse{Type: "roomInitiation", Success: true, RoomID: room.ID, Participants: participants})
	if err != nil {
		return err
	}

	err = conn.WriteMessage(websocket.TextMessage, out)
	if err != nil {
		return err
	}

	return nil
}

// Handler for messages with unknown commands. Returns an error message.
func unknownCommandEvent(conn *websocket.Conn, raw []byte) error {
	var out []byte
	var message SignalMessage

	err := json.Unmarshal(raw, &message)
	if err != nil {
		return err
	}

	out, err = json.Marshal(Response{Type: "error", Success: false, Message: "Unrecognized command"})
	if err != nil {
		return err
	}
	err = conn.WriteMessage(websocket.TextMessage, out)
	if err != nil {
		return err
	}

	return nil
}
