package main

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

// A handler for the /initiate endpoint to validate a username and room ID.
func initiateHandler(roomService *RoomService, signalingServer *SignalingServer) echo.HandlerFunc {
	return func(c echo.Context) error {
		// Extract the 'name' and 'roomID' query parameters.
		name := c.QueryParam("name")
		roomID := c.QueryParam("roomID")

		// Initialize the response with default success values.
		response := map[string]bool{
			"name_success": true,
			"room_success": true,
		}

		// Check if the name already exists in the signaling server.
		if signalingServer.UserFromName(name) != nil {
			response["name_success"] = false
		}

		// Check if the room exists in the room service.
		room, err := roomService.Get(roomID)
		if err != nil || room == nil {
			response["room_success"] = false
		}

		// Return both name and room success statuses.
		return c.JSON(http.StatusOK, response)
	}
}
