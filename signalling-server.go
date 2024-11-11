package main

import (
	"errors"
	"sync"

	"github.com/gorilla/websocket"
)

// The server instance
type SignalingServer struct {
	users    []*User
	rooms    *RoomService
	upgrader websocket.Upgrader
	mux      sync.Mutex
}

// The User struct. Each User contains its name, its peer's name, and the WebSocket connection.
type User struct {
	Name string
	Conn *websocket.Conn
}

// Adds a new user to the list of connected users. The User struct contains the Connection and the Name.
func (ss *SignalingServer) AddUser(conn *websocket.Conn, name string) {
	ss.mux.Lock()
	defer ss.mux.Unlock()

	ss.users = append(ss.users, &User{Name: name, Conn: conn})
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

// Removes user the user with this connection.
func (ss *SignalingServer) RemoveUser(conn *websocket.Conn) error {
	ss.mux.Lock()
	defer ss.mux.Unlock()

	for i, user := range ss.users {
		if user.Conn == conn {
			// Remove the user from the list by appending everything before and after the user
			ss.users = append(ss.users[:i], ss.users[i+1:]...)
			return nil
		}
	}

	return errors.New("user not found")
}
