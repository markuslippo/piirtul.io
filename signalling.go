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

	if err := ss.UpdatePeer(author.Name, peer.Name); err != nil {
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

	if err = conn.WriteMessage(websocket.TextMessage, out); err != nil {
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

func (ss *SignalingServer) connHandler(conn *websocket.Conn) error {
	var message SignalMessage

	_, raw, err := conn.ReadMessage()
	if err != nil {
		return err
	}

	err = json.Unmarshal(raw, &message)
	if err != nil {
		out, err := json.Marshal(DefaultError{Type: "error", Message: "Incorrect data format"})
		if err != nil {
			return err
		}

		err = conn.WriteMessage(websocket.TextMessage, out)
		if err != nil {
			return err
		}
		return nil
	}

	switch message.Type {
	case "login":
		err = ss.loginEvent(conn, message)
	case "offer":
		err = ss.offerEvent(conn, message)
	case "answer":
		err = ss.answerEvent(conn, message)
	case "candidate":
		err = ss.candidateEvent(conn, message)
	case "leave":
		err = ss.leaveEvent(conn)
	default:
		err = unknownCommandEvent(conn, raw)
	}

	if err != nil {
		return err
	}

	return nil
}

func (ss *SignalingServer) Handler(c echo.Context) error {
	ws, err := ss.upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}

	c.Logger().Debugf("%v accesses the server", ws.RemoteAddr())
	for {
		err := ss.connHandler(ws)
		if err != nil && err.Error() == "websocket: close 1001 (going away)" {
			user := ss.UserFromConn(ws)
			if user == nil {
				c.Logger().Debugf("connection closed for %v", ws.RemoteAddr())
			} else {
				ss.leaveEvent(ws)
				c.Logger().Debugf("connection closed for %v", user.Name)
			}
			c.Logger().Error(err)
		}
	}
}
