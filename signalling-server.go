package main

import (
	"errors"
	"sync"

	"github.com/gorilla/websocket"
)

type User struct {
	Name string
	Peer string
	Conn *websocket.Conn
}

type SignalingServer struct {
	users    []*User
	upgrader websocket.Upgrader
	mux      sync.Mutex
}

func (ss *SignalingServer) AddUser(conn *websocket.Conn, name string) {
	ss.mux.Lock()
	defer ss.mux.Unlock()

	ss.users = append(ss.users, &User{Name: name, Conn: conn})
}

func (ss *SignalingServer) AllUserNames() []string {
	ss.mux.Lock()
	defer ss.mux.Unlock()

	users := make([]string, len(ss.users))
	for _, user := range ss.users {
		users = append(users, user.Name)
	}

	return users
}

func (ss *SignalingServer) NotifyUsers(notify func(*User)) {
	// TODO: handle error
	for _, user := range ss.users {
		notify(user)
	}
}

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

func (ss *SignalingServer) UserFromConn(conn *websocket.Conn) *User {
	for _, user := range ss.users {
		if user.Conn == conn {
			return user
		}
	}

	return nil
}

func (ss *SignalingServer) UserFromName(name string) *User {
	for _, user := range ss.users {
		if user.Name == name {
			return user
		}
	}

	return nil
}

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
