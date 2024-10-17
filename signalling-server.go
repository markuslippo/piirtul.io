package main

import (
	"errors"
	"sync"

	"github.com/gorilla/websocket"
)

type SignalingServer struct {
	users    []*User
	rooms    *RoomService
	upgrader websocket.Upgrader
	mux      sync.Mutex
}

// The User struct. Each User contains its name, its peer's name, and the WebSocket connection.
type User struct {
	Name string
	Peer string
	Conn *websocket.Conn
}

// Adds a new user to the list of connected users. The User struct contains the Connection and the Name.
func (ss *SignalingServer) AddUser(conn *websocket.Conn, name string) {
	ss.mux.Lock()
	defer ss.mux.Unlock()

	ss.users = append(ss.users, &User{Name: name, Conn: conn})
}

// Returns a list of all connected users.
func (ss *SignalingServer) AllUserNames() []string {
	ss.mux.Lock()
	defer ss.mux.Unlock()

	users := make([]string, len(ss.users))
	for _, user := range ss.users {
		users = append(users, user.Name)
	}

	return users
}

// Iterates over all connected users and applies the provided function (notify)
func (ss *SignalingServer) NotifyUsers(notify func(*User)) {
	// TODO: handle error
	for _, user := range ss.users {
		notify(user)
	}
}

// Given a user's connection, returns the peer of this connection if it exists.
func (ss *SignalingServer) PeerFromConn(conn *websocket.Conn) *websocket.Conn {
	for _, user := range ss.users {
		if user.Conn == conn {
			for _, peerUser := range ss.users {
				if peerUser.Name == user.Peer {
					return peerUser.Conn
				}
			}
		}
	}
	return nil
}

// Returns a User that is the peer for a given name
func (ss *SignalingServer) PeerFromName(name string) *User {
	for _, user := range ss.users {
		for _, peerUser := range ss.users {
			if user.Peer == peerUser.Name {
				return peerUser
			}
		}
	}

	return nil
}

// Returns a User associated with the given connection.
func (ss *SignalingServer) UserFromConn(conn *websocket.Conn) *User {
	for _, user := range ss.users {
		if user.Conn == conn {
			return user
		}
	}

	return nil
}

// Returns a User with the specified name.
func (ss *SignalingServer) UserFromName(name string) *User {
	for _, user := range ss.users {
		if user.Name == name {
			return user
		}
	}

	return nil
}

// Sets the peer of a given user. Updates the Peer field for the user.
func (ss *SignalingServer) UpdatePeer(origin, peer string) error {
	ss.mux.Lock()
	defer ss.mux.Unlock()

	for _, user := range ss.users {
		if user.Name == origin {
			user.Peer = peer
			return nil
		}
	}

	return errors.New("missing origin user")
}
