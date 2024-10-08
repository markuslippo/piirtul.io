package main

import (
	"github.com/labstack/echo/v4"
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

// Middleware to provide handlers with access to the room service.
func (roomService *RoomService) Use(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		c.Set(ContextVariableName, roomService)
		return next(c)
	}
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
	data []Room
}

// Creates a new room for a user and returns it.
func (roomSlice *RoomSlice) Create(user *User) (*Room, error) {

	return nil, nil
}

// Gets a room.
func (roomSlice *RoomSlice) Get(roomID string) (*Room, error) {
	return nil, nil
}

// Clears all rooms.
func (roomSlice *RoomSlice) Clear() error {
	return nil
}
