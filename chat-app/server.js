const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/chat_app" ).then(() => {
    console.log("Connected to MongoDB Atlas!");
}).catch((error) => {
    console.error("MongoDB connection error:", error);
});

// Enhanced User Schema with avatar
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    avatar: { type: String, default: null },
    lastSeen: { type: Date, default: Date.now }
});

// Enhanced Message Schema with status
const MessageSchema = new mongoose.Schema({
    sender: { type: String, required: true },
    receiver: { type: String, required: true },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' }
});

const User = mongoose.model('User', UserSchema);
const Message = mongoose.model('Message', MessageSchema);

// Serve the single HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// Add these routes to your existing server.js
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/chat.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Add this middleware to protect the chat route
app.use('/chat.html', (req, res, next) => {
    // In a production environment, you'd want to verify the session/token here
    next();
});
// Enhanced user routes
app.get('/users', async (req, res) => {
    try {
        const users = await User.find({}, 'username lastSeen');
        res.json(users);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
});

app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ 
            username, 
            password: hashedPassword,
            lastSeen: new Date()
        });
        await newUser.save();
        
        res.status(201).json({ success: true, message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Registration failed' });
    }
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        // Update last seen
        user.lastSeen = new Date();
        await user.save();

        res.json({ success: true, username: user.username });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Login failed' });
    }
});

// Enhanced messages route with pagination
app.get('/messages/:sender/:receiver', async (req, res) => {
    try {
        const { sender, receiver } = req.params;
        const page = parseInt(req.query.page) || 0;
        const limit = parseInt(req.query.limit) || 50;

        const messages = await Message.find({
            $or: [
                { sender, receiver },
                { sender: receiver, receiver: sender }
            ]
        })
        .sort({ timestamp: -1 })
        .skip(page * limit)
        .limit(limit)
        .sort({ timestamp: 1 });
        
        // Mark messages as read
        await Message.updateMany(
            { sender: receiver, receiver: sender, status: { $ne: 'read' } },
            { $set: { status: 'read' } }
        );

        res.json(messages);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch messages' });
    }
});

// Socket.io handling
const userSockets = new Map();

io.on('connection', (socket) => {
    console.log("User connected");

    socket.on('user_connected', (username) => {
        userSockets.set(username, socket.id);
    });

    socket.on('send_message', async (messageData) => {
        try {
            const newMessage = new Message({
                ...messageData,
                status: 'sent'
            });
            await newMessage.save();

            // Send to receiver if online
            const receiverSocketId = userSockets.get(messageData.receiver);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('receive_message', messageData);
                await Message.findByIdAndUpdate(newMessage._id, { status: 'delivered' });
            }

            // Send back to sender
            io.emit('receive_message', messageData);
        } catch (error) {
            console.error('Message save error:', error);
        }
    });

    socket.on('disconnect', () => {
        // Remove user from online users
        for (const [username, socketId] of userSockets.entries()) {
            if (socketId === socket.id) {
                userSockets.delete(username);
                // Update last seen in database
                User.findOneAndUpdate(
                    { username },
                    { lastSeen: new Date() }
                ).exec();
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});