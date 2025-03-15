const socket = io();

// ✅ Get logged-in user info
const loggedInUser = document.getElementById("loggedInUser").dataset.username; 

// ✅ Send Message
document.getElementById("sendBtn").addEventListener("click", () => {
    const messageInput = document.getElementById("messageInput");
    const message = messageInput.value.trim();

    if (message) {
        socket.emit("sendMessage", { sender: loggedInUser, text: message }); 
        messageInput.value = ""; // Clear input after sending
    }
});

// ✅ Listen for Online Users Update
socket.on("updateUserList", (users) => {
    console.log("🔹 Online Users List Updated (Client Side):", users);

    const userList = document.getElementById("onlineUsersList");
    userList.innerHTML = ""; // Purani list clear karo

    if (users.length === 0) {
        userList.innerHTML = "<li>No users online</li>"; // Fallback case
        return;
    }

    users.forEach(user => {
        const listItem = document.createElement("li");
        listItem.textContent = user;
        userList.appendChild(listItem);
    });
});

// ✅ Receive & Display Messages
socket.on("receiveMessage", (message) => {
    console.log("📩 New message received:", message);
    const messageContainer = document.getElementById("messages");

    const newMessage = document.createElement("div");
    newMessage.classList.add("message");

    // ✅ Message sender check (for self messages)
    if (message.sender === loggedInUser) {
        newMessage.classList.add("my-message"); // Apply special class for user's messages
    }

    newMessage.innerText = `${message.sender}: ${message.text}`;
    messageContainer.appendChild(newMessage);

    // ✅ Auto-scroll to latest message
    messageContainer.scrollTop = messageContainer.scrollHeight;
});
