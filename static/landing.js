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
        roomOwner = prompt("Enter the room owner's name:");
        if (roomOwner) {
            const user = { role: 'participant', name: username, roomOwner: roomOwner };
            localStorage.setItem('user', JSON.stringify(user));
            window.location.href = '/room';
        }
    } else {
        console.log("Please enter a name");
    }
});