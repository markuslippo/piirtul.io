package main

import (
	"errors"
	"fmt"
)

// Context room service key.
const ContextVariableName string = "room-service-key"

// Room data representation.
type Room struct {
	ID    string `json:"room_id"`
	Owner *User
	Users []*User
}

// Interface for room operations.
type RoomDatabase interface {
	// Creates a new room for a user and returns it.
	Create(user *User, roomID string) (*Room, error)

	// Gets a room.
	Get(roomID string) (*Room, error)

	// Gets the first room with the user.
	GetFirstRoomWithUser(user *User) (*Room, error)

	// Joins a room.
	Join(roomID string, user *User) error

	RemoveUserFromRoom(roomID string, user *User) error

	DeleteRoom(roomID string) error

	// Clears all rooms.
	Clear() error
}

// The service for handling room operations.
type RoomService struct {
	DB RoomDatabase
}

// Creates a new room for a user and returns it.
func (roomService *RoomService) Create(user *User, roomID string) (*Room, error) {
	return roomService.DB.Create(user, roomID)
}

// Gets a room.
func (roomService *RoomService) Get(roomID string) (*Room, error) {
	return roomService.DB.Get(roomID)
}

// Gets the first room with the user.
func (roomService *RoomService) GetFirstRoomWithUser(user *User) (*Room, error) {
	return roomService.DB.GetFirstRoomWithUser(user)
}

// Joins a room.
func (roomService *RoomService) Join(roomID string, user *User) error {
	return roomService.DB.Join(roomID, user)
}

func (roomService *RoomService) RemoveUserFromRoom(roomID string, user *User) error {
	return roomService.DB.RemoveUserFromRoom(roomID, user)
}

func (roomService *RoomService) DeleteRoom(roomID string) error {
	return roomService.DB.DeleteRoom(roomID)
}


// Clears all rooms.
func (roomService *RoomService) Clear() error {
	return roomService.DB.Clear()
}

// The implementation of room database as a slice.
type RoomSlice struct {
	rooms []*Room
}

// Creates a new room for a user and returns it.
func (roomSlice *RoomSlice) Create(user *User, roomID string) (*Room, error) {
	if user == nil {
		return nil, errors.New("user is nil")
	}
	room := &Room{
		ID:    roomID,
		Owner: user,
		Users: []*User{user},
	}
	roomSlice.rooms = append(roomSlice.rooms, room)
	return room, nil
}

// Gets a room.
func (roomSlice *RoomSlice) Get(roomID string) (*Room, error) {
	for i := 0; i < len(roomSlice.rooms); i++ {
		room := roomSlice.rooms[i]
		if room.ID == roomID {
			return room, nil
		}
	}
	return nil, errors.New("no room found")
}

// Gets the first room with the user.
func (roomSlice *RoomSlice) GetFirstRoomWithUser(user *User) (*Room, error) {
	for i := 0; i < len(roomSlice.rooms); i++ {
		room := roomSlice.rooms[i]
		for j := 0; j < len(room.Users); j++ {
			if user == room.Users[j] {
				return room, nil
			}
		}
	}
	return nil, nil
}


// Joins a room.
func (roomSlice *RoomSlice) Join(roomID string, user *User) error {
	if user == nil {
		return errors.New("user is nil")
	}
	room, err := roomSlice.Get(roomID)
	if err != nil {
		return err
	}
	if room == nil {
		return errors.New("no room found")
	}

	room.Users = append(room.Users, user)
	return nil
}

func (roomSlice *RoomSlice) RemoveUserFromRoom(roomID string, user *User) error {
	if roomID == "" || user == nil {
		return errors.New("Request is missing data")
	}
	room, err := roomSlice.Get(roomID)
	if err != nil {
		return err
	}
	if room == nil {
		return errors.New("no room found")
	}
	for i, roomUser := range room.Users {
		if roomUser.Name == user.Name {
			// Remove the user from the list by appending everything before and after the user
			room.Users = append(room.Users[:i], room.Users[i+1:]...)
			return nil
		}
	}
	return nil
}

func (roomSlice *RoomSlice) DeleteRoom(roomID string) error {
	
	for i, room := range roomSlice.rooms {
		if room.ID == roomID {
			roomSlice.rooms = append(roomSlice.rooms[:i], roomSlice.rooms[i+1:]...)
			return nil
		}
	}
	return nil
}



// Clears all rooms.
func (roomSlice *RoomSlice) Clear() error {
	roomSlice.rooms = []*Room{}
	return nil
}

// Helper function for checking the servers state
func (roomService *RoomService) PrintServerState() {
	// Printing all rooms and users
	fmt.Println("Server State:")
	if len(roomService.DB.(*RoomSlice).rooms) == 0 {
		fmt.Println("No rooms available.")
	} else {
		for _, room := range roomService.DB.(*RoomSlice).rooms {
			fmt.Printf("\nRoom ID: %s (Owner: %s)\n", room.ID, room.Owner.Name)
			fmt.Println("Users in this room:")
			for _, user := range room.Users {
				fmt.Printf("  - %s\n", user.Name)
			}
		}
	}
}