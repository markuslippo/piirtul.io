var createRoomButton= document.querySelector('#create-room-btn'); 
var joinRoomButton = document.querySelector('#join-room-btn'); 

createRoomButton.addEventListener("click", function() {
    const name = document.querySelector('#name').value; 
    if (name) {
        alert("Creating room for " + name);
    } else {
        alert("Please enter a name");
    }
});

joinRoomButton.addEventListener("click", function() {
    const name = document.querySelector('#name').value; 
    if (!name) {
        alert("Please enter a name");
    } else {
        const roomCode = prompt("Please enter the 4-letter room code:");
        window.location.href = `/kallu`;
    }
});