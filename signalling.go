package main

import (
	"encoding/json"
	"errors"
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

// A struct for incoming socket messages.
type SocketMessage struct {
	Type      string     `json:"type"`
	RoomID    string     `json:"room_id,omitempty"`
	Name      string     `json:"name,omitempty"`
	Offer     *Offer     `json:"offer,omitempty"`
	Answer    *Answer    `json:"answer,omitempty"`
	Candidate *Candidate `json:"candidate,omitempty"`
	Role      string     `json:"role,omitempty"`
}

// A struct for default outgoing messages.
type SocketResponse struct {
	Type    string `json:"type"`
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
}

// A more spesific struct for Room Initiation response, sending also participants and the RoomID
type RoomSocketResponse struct {
	Type         string   `json:"type"`
	Success      bool     `json:"success"`
	RoomID       string   `json:"room_id,omitempty"`
	Participants []string `json:"participants,omitempty"`
	Message      string   `json:"message,omitempty"`
}

// A more specific struct for LeavingResponse
type LeavingResponse struct {
	Type        string `json:"type"`
	Name        string `json:"name"`
	RoomDestroy bool   `json:"room_destroy"`
}

// Handler is a HTTP handler function that upgrades the HTTP request to a WebSocket connection,
// routes WebSocket messages and manages the connection lifecycle.
func (ss *SignalingServer) Handler(c echo.Context) error {
	ws, err := ss.upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	c.Logger().Debugf("%v accesses the server", ws.RemoteAddr())

	// Handle events/messages for this WebSocket connection
	for {
		err := ss.connHandler(ws)
		if err != nil {
			// Client closed the browser
			if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				user := ss.UserFromConn(ws)
				if user == nil {
					//c.Logger().Debugf("Connection closed for %v", ws.RemoteAddr())
				} else {
					ss.leaveEvent(ws)
					//c.Logger().Debugf("Connection closed for user %v", user.Name)
				}
				return nil
			}
			// Connection closed unexpectedly
			if websocket.IsUnexpectedCloseError(err) {
				//c.Logger().Errorf("Unexpected WebSocket closure for %v: %v", ws.RemoteAddr(), err)
				ss.leaveEvent(ws)
				return err
			}

			// Log any other errors
			c.Logger().Errorf("Error occurred while handling WebSocket connection: %v", err)
			return err
		}
	}
}

// This is the handler for incoming WebSocket messages. The messages are read, and based on the message type
// are then routed to their corresponding functions.
func (ss *SignalingServer) connHandler(connection *websocket.Conn) error {
	var message SocketMessage
	_, raw, err := connection.ReadMessage()
	if err != nil {
		return err
	}
	err = json.Unmarshal(raw, &message)
	if err != nil {
		response := SocketResponse{Type: "error", Success: false, Message: "Incorrect message format"}
		return sendSocketResponse(connection, response)
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
		err = unknownCommandEvent(connection)
	}

	// Return any errors from the event handlers
	if err != nil {
		SocketResponse := SocketResponse{Type: "error", Success: false, Message: err.Error()}
		_ = sendSocketResponse(connection, SocketResponse)
		return err
	}
	return nil
}

// The initiationEvent adds the User with this connection to the server.
func (ss *SignalingServer) initiationEvent(conn *websocket.Conn, data SocketMessage) error {
	user := ss.UserFromName(data.Name)
	if user != nil {
		SocketResponse := SocketResponse{Type: "initiation", Success: false, Message: "User with the given name exists already"}
		return sendSocketResponse(conn, SocketResponse)
	}
	ss.AddUser(conn, data.Name)
	log.Printf("[SERVER] Initialized for user %s", data.Name)
	SocketResponse := SocketResponse{Type: "initiation", Success: true}
	return sendSocketResponse(conn, SocketResponse)
}

// The roomInitiationEvent checks if a room with this ID exists, joins it, and sends the other participants. If we are a creator, we create the room first.
func (ss *SignalingServer) roomInitiationEvent(conn *websocket.Conn, data SocketMessage) error {
	user := ss.UserFromConn(conn)
	if user == nil {
		response := RoomSocketResponse{Type: "roomInitiation", Success: false, Message: "User does not exist"}
		return sendSocketResponse(conn, response)
	}

	//If we are a creator, create the room and return a success response.
	if data.Role == "creator" {
		_, err := ss.rooms.Create(user, data.RoomID)
		if err != nil {
			response := RoomSocketResponse{Type: "roomInitiation", Success: false, Message: "Failed to create room"}
			return sendSocketResponse(conn, response)
		}
		log.Printf("[SERVER] %s created room %s\n", user.Name, data.RoomID)
		response := RoomSocketResponse{Type: "roomInitiation", Success: true, RoomID: data.RoomID, Participants: []string{}}
		return sendSocketResponse(conn, response)

		//If we are a participant, try to find that room, gather the participants and return the success with the other participants.
	} else if data.Role == "participant" {
		room, err := ss.rooms.Get(data.RoomID)
		if err != nil || room == nil {
			response := RoomSocketResponse{Type: "roomInitiation", Success: false, Message: "Room not found"}
			return sendSocketResponse(conn, response)
		}

		err = ss.rooms.Join(data.RoomID, user)
		if err != nil {
			response := RoomSocketResponse{Type: "roomInitiation", Success: false, Message: "Failed to join room"}
			return sendSocketResponse(conn, response)
		}

		participants := []string{}
		for _, roomUser := range room.Users {
			if roomUser.Name != user.Name {
				participants = append(participants, roomUser.Name)
			}
		}
		log.Printf("[%s] User '%s' joined\n", data.RoomID, user.Name)
		response := RoomSocketResponse{Type: "roomInitiation", Success: true, RoomID: room.ID, Participants: participants}
		return sendSocketResponse(conn, response)

	} else {
		response := RoomSocketResponse{Type: "roomInitiation", Success: false, Message: "Invalid role"}
		return sendSocketResponse(conn, response)
	}
}

// Handler that forwards an offer from the sender to the receiver
func (ss *SignalingServer) offerConnectionEvent(conn *websocket.Conn, data SocketMessage) error {
	sender := ss.UserFromConn(conn)
	if sender == nil {
		return errors.New("the sender does not exist")
	}
	receiver := ss.UserFromName(data.Name)
	if receiver == nil {
		return errors.New("the offer receiver does not exist")
	}
	SocketResponse := SocketMessage{
		Type:  "offer",
		Name:  sender.Name,
		Offer: data.Offer,
	}

	// Get the room room (for logging purposes only)
	room, err := ss.rooms.GetFirstRoomWithUser(sender)
	if err != nil {
		return err
	}
	log.Printf("[%s] Offer sent from '%s' to '%s'", room.ID, sender.Name, receiver.Name)
	return sendSocketResponse(receiver.Conn, SocketResponse)
}

// Handler that forwards an answer from the sender to the receiver.
func (ss *SignalingServer) answerConnectionEvent(conn *websocket.Conn, data SocketMessage) error {
	sender := ss.UserFromConn(conn)
	if sender == nil {
		return errors.New("the answer sender does not exist")
	}
	receiver := ss.UserFromName(data.Name)
	if receiver == nil {
		return errors.New("the answer receiver does not exist")
	}
	SocketResponse := SocketMessage{
		Type:   "answer",
		Name:   sender.Name,
		Answer: data.Answer,
	}

	// Get the room room (for logging purposes only)
	room, err := ss.rooms.GetFirstRoomWithUser(sender)
	if err != nil {
		return err
	}
	log.Printf("[%s] Answer sent from '%s' to '%s'", room.ID, sender.Name, receiver.Name)
	return sendSocketResponse(receiver.Conn, SocketResponse)
}

// Handler that forwards ICE candidates from the sender to the receiver.
func (ss *SignalingServer) candidateExchangingEvent(conn *websocket.Conn, data SocketMessage) error {
	sender := ss.UserFromConn(conn)
	if sender == nil {
		return errors.New("the candidate sender does not exist")
	}
	receiver := ss.UserFromName(data.Name)
	if receiver == nil {
		return errors.New("the candidate receiver does not exist")
	}
	sm := SocketMessage{
		Type:      "candidate",
		Name:      sender.Name,
		Candidate: data.Candidate,
	}
	err := sendSocketResponse(receiver.Conn, sm)
	if err != nil {
		return err
	}

	// Get the room room (for logging purposes only)
	room, err := ss.rooms.GetFirstRoomWithUser(sender)
	if err != nil {
		return err
	}
	log.Printf("[%s] Candidate sent from '%s' to '%s'", room.ID, sender.Name, receiver.Name)
	return nil
}

func (ss *SignalingServer) leaveEvent(conn *websocket.Conn) error {
	if conn == nil {
		return errors.New("invalid connection")
	}

	leavingUser := ss.UserFromConn(conn)
	if leavingUser == nil {
		log.Println("[SERVER] Leaving user is nil")
		return errors.New("the leaving user does not exist")
	}

	log.Printf("[SERVER] User %s is attempting to leave", leavingUser.Name)

	// Attempt to get the user's room
	room, err := ss.rooms.GetFirstRoomWithUser(leavingUser)
	if err != nil {
		log.Printf("[SERVER] Error finding room for user %s: %v", leavingUser.Name, err)
	}

	roomDestroy := false
	if room != nil {
		// Check if room should be destroyed
		roomDestroy = room.Owner != nil && room.Owner == leavingUser
		log.Printf("[%s] User %s is leaving the room. Room is going to shut down: %t", room.ID, leavingUser.Name, roomDestroy)

		// Notify other participants
		leavingResponse := LeavingResponse{Type: "peerLeavingRoom", Name: leavingUser.Name, RoomDestroy: roomDestroy}
		for _, user := range room.Users {
			if user == nil || user.Conn == nil || user.Name == leavingUser.Name {
				continue
			}
			err := sendSocketResponse(user.Conn, leavingResponse)
			if err != nil {
				log.Printf("[%s] Failed to send leaving notification to user %s: %v", room.ID, user.Name, err)
				continue
			}
			log.Printf("[%s] Sent leaving notification to user %s", room.ID, user.Name)
		}

		// Remove room if needed
		if roomDestroy {
			if err := ss.rooms.DeleteRoom(room.ID); err != nil {
				log.Printf("[%s] Failed to delete room: %v", room.ID, err)
			} else {
				log.Printf("[%s] Room deleted because owner %s left", room.ID, leavingUser.Name)
			}
		} else {
			if err := ss.rooms.RemoveUserFromRoom(room.ID, leavingUser); err != nil {
				log.Printf("[%s] Failed to remove user from room: %v", room.ID, err)
			}
		}
	} else {
		log.Printf("[SERVER] Room not found for user %s. Proceeding with user removal only.", leavingUser.Name)
	}

	// Remove user from server
	if err := ss.RemoveUser(conn); err != nil {
		log.Printf("[SERVER] Failed to remove user from server %s: %v", leavingUser.Name, err)
		return err
	}

	// Send leave confirmation response to the leaving user
	confirmationResponse := SocketResponse{Type: "leaveConfirmed", Success: true, Message: "User successfully left the room"}
	err = sendSocketResponse(conn, confirmationResponse)
	if err != nil {
		log.Printf("[SERVER] Failed to send confirmation: %v", err)
	}

	conn.Close()
	return err
}

// Handler for messages with unknown commands. Returns an error message.
func unknownCommandEvent(conn *websocket.Conn) error {
	log.Printf("[SERVER] Received an unknown command")
	SocketResponse := SocketResponse{Type: "error", Success: false, Message: "Unrecognized command"}
	return sendSocketResponse(conn, SocketResponse)
}

// A helper function that Marshals data to JSON and sends it to the WebSocket.
// Returns nil if no errors, otherwise returns the error.
func sendSocketResponse(conn *websocket.Conn, data interface{}) error {
	SocketResponse, err := json.Marshal(data)
	if err != nil {
		return err
	}

	err = conn.WriteMessage(websocket.TextMessage, SocketResponse)
	if err != nil {
		return err
	}
	return nil
}
