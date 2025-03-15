const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const flash = require("connect-flash");
const MongoStore = require("connect-mongo");
const { Server } = require("socket.io");
const bcrypt = require("bcrypt");
const User = require("./models/User");
const Message = require("./models/message"); // ✅ Import Message Model
require("dotenv").config();

const app = express();
const server = http.createServer(app);

// ✅ SESSION MIDDLEWARE SETUP
const sessionMiddleware = session({
    secret: "your_secret_key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
});

// ✅ Express session middleware
app.use(sessionMiddleware);

// ✅ Initialize Socket.io
const io = new Server(server);

// ✅ Share session with socket.io
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

// ✅ MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.error("❌ MongoDB Connection Error:", err));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

// ✅ Passport Configuration
require("./passport-config")(passport);
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// ✅ View Engine (EJS)
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");

// ==================== ROUTES ====================

// ✅ Home Route
app.get("/", (req, res) => {
    res.render("index", { user: req.user });
});

// ✅ Signup Route
app.get("/signup", (req, res) => {
    res.render("signup");  
});

app.post("/signup", async (req, res) => {
    const { username, email, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        req.flash("error", "User already exists");
        return res.redirect("/");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();
    
    req.flash("success", "Signup successful, please log in");
    res.redirect("/");
});

// ✅ Login Route
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect("/login");
}

app.get("/login", (req, res) => {
    res.render("login", { messages: req.flash() });
});

app.post("/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
        if (err) return next(err);
        if (!user) {
            req.flash("error", "Invalid credentials");
            return res.redirect("/");
        }

        req.logIn(user, (err) => {
            if (err) return next(err);
            return res.redirect("/chat");
        });
    })(req, res, next);
});

// ✅ Chat Page
app.get("/chat", ensureAuthenticated, async (req, res) => {
    const messages = await Message.find().sort({ timestamp: 1 }).limit(50); // Load previous messages
    res.render("chat", { user: req.user, messages });
});

// ✅ Logout Route
app.get("/logout", (req, res, next) => {
    req.logout((err) => {
        if (err) {
            console.error("Logout Error:", err);
            return next(err);
        }
        req.session.destroy((err) => {
            if (err) {
                console.error("Session Destroy Error:", err);
                return res.status(500).send("Error destroying session");
            }
            res.clearCookie("connect.sid");
            res.redirect("/login");
        });
    });
});

// ==================== SOCKET.IO LOGIC ====================

// ✅ Online Users Tracking
let onlineUsers = {};

io.on("connection", async (socket) => {
    console.log("🔵 User connected:", socket.id);

    if (!socket.request.session || !socket.request.session.passport) {
        console.log("⚠️ No session found for socket:", socket.id);
        return;
    }

    const userId = socket.request.session.passport.user;

    try {
        const user = await User.findById(userId);
        if (user) {
            onlineUsers[userId] = user.username;
            io.emit("updateUserList", Object.values(onlineUsers));
            io.emit("userJoined", user.username); // ✅ Notify users
            console.log("✅ Online Users List Updated:", onlineUsers);
        }
    } catch (err) {
        console.error("❌ Error fetching user:", err);
    }

    // ✅ Handle Message Sending
    socket.on("sendMessage", async (messageData) => {
        console.log("📩 Message received:", messageData);

        // Save to Database
        const newMessage = new Message({
            sender: messageData.sender,
            text: messageData.text,
            timestamp: new Date(),
            seen: false, // ✅ Message Read Receipt
            reactions: {} // ✅ Reactions Feature
        });
        await newMessage.save();

        // ✅ Broadcast message to all users
        io.emit("receiveMessage", messageData);
    });

    // ✅ Handle Message Reactions
    socket.on("addReaction", async ({ messageId, userId, reaction }) => {
        try {
            const message = await Message.findById(messageId);
            if (message) {
                if (!message.reactions[userId]) {
                    message.reactions[userId] = reaction;
                } else {
                    delete message.reactions[userId]; // Toggle reaction off
                }
                await message.save();
                io.emit("updateReactions", { messageId, reactions: message.reactions });
            }
        } catch (err) {
            console.error("❌ Error adding reaction:", err);
        }
    });

    // ✅ Handle Typing Indicator
    socket.on("userTyping", (username) => {
        socket.broadcast.emit("showTyping", username);
    });

    socket.on("userStoppedTyping", () => {
        socket.broadcast.emit("hideTyping");
    });

    // ✅ Handle User Disconnection
    socket.on("disconnect", () => {
        console.log("🔴 User disconnected:", socket.id);
        if (socket.request.session && socket.request.session.passport) {
            const userId = socket.request.session.passport.user;
            if (onlineUsers[userId]) {
                io.emit("userLeft", onlineUsers[userId]); // ✅ Notify users
                delete onlineUsers[userId];
                io.emit("updateUserList", Object.values(onlineUsers));
            }
        }
    });
});

// ==================== SERVER START ====================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
