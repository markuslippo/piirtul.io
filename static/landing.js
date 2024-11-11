// DOM elements for readability
const createRoomButton = document.querySelector('#create-room-btn');
const joinRoomButton = document.querySelector('#join-room-btn');
const nameInput = document.querySelector('#name');

// Handle room creation
createRoomButton.addEventListener("click", function() {
    username = nameInput.value;
    if (username.length > 0) {
        const user = { role: 'creator', name: username };
        localStorage.setItem('user', JSON.stringify(user));
        window.location.href = '/room';
    } else {
        alert("Please enter a name");
    }
});

// Handle room joining
joinRoomButton.addEventListener("click", function() {
    username = nameInput.value;
    if (username.length > 0) {
        roomID = prompt("Enter the roomID:");
        if (roomID) {
            // Send a GET request to /initiate
            fetch(`/initiate?name=${encodeURIComponent(username)}&roomID=${encodeURIComponent(roomID.toUpperCase())}`)
                .then(response => response.json())
                .then(data => {
                    const { name_success, room_success } = data;
                    if (name_success && room_success) {
                        // Both checks passed; proceed to the room
                        const user = { role: 'participant', name: username, roomID: roomID.toUpperCase() };
                        localStorage.setItem('user', JSON.stringify(user));
                        window.location.href = '/room';
                    } else {
                        // Alert the user about the error(s)
                        if (!name_success && !room_success) {
                            alert("Username is already taken and the room ID does not exist.");
                        } else if (!name_success) {
                            alert("Username is already taken.");
                        } else {
                            alert("Room ID does not exist.");
                        }
                    }
                })
                .catch(error => {
                    console.error("Error during initiation:", error);
                    alert("An error occurred. Please try again.");
                });
        }
    } else {
        alert("Please enter a name");
    }
});
