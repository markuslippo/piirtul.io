// DOM stuff for readability
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
        console.log("Please enter a name");
    }
});

// Handle joom roin
joinRoomButton.addEventListener("click", function() {
    username = nameInput.value;
    if (username.length > 0) {
        roomID = prompt("Enter the roomID:");
        if (roomID) {
            const user = { role: 'participant', name: username, roomID: roomID.toUpperCase() };
            localStorage.setItem('user', JSON.stringify(user));
            window.location.href = '/room';
        }
    } else {
        console.log("Please enter a name");
    }
});