package main

import (
	"fmt"
)

// Context room service key.
const ContextVariableName string = "room-service-key"

// Room data representation.
type Room struct {
	ID string `json:"room_id"`
}

// Interface for room operations.
type RoomDatabase interface {
	// Creates a new room for a user and returns it.
	Create(user *User) (*Room, error)

	// Gets a room.
	Get(roomID string) (*Room, error)

	// Clears all rooms.
	Clear() error
}

// The service for handling room operations.
type RoomService struct {
	DB RoomDatabase
}

// Creates a new room for a user and returns it.
func (roomService *RoomService) Create(user *User) (*Room, error) {
	return roomService.DB.Create(user)
}

// Gets a room.
func (roomService *RoomService) Get(roomID string) (*Room, error) {
	return roomService.DB.Get(roomID)
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
func (roomSlice *RoomSlice) Create(user *User) (*Room, error) {
	room := &Room{
		ID: user.Name,
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
	return nil, fmt.Errorf("could not find room with id: %s", roomID)
}

// Clears all rooms.
func (roomSlice *RoomSlice) Clear() error {
	roomSlice.rooms = []*Room{}
	return nil
}
