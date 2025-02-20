const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const userRoutes = require('./routes/userRoutes');
const messageRoutes = require('./routes/messageRoutes');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat_app')
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => console.error('MongoDB connection error:', error));

// Routes
app.use('/api', userRoutes);
app.use('/api', messageRoutes);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  // Serve static files from the React app
  const clientBuildPath = path.join(__dirname, '../chat-app-client/dist');
  app.use(express.static(clientBuildPath));

  // Handle React routing, return all requests to React app
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Socket.IO Connection
const userSockets = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('user_connected', (username) => {
    userSockets.set(username, socket.id);
    console.log(`${username} connected with socket ID: ${socket.id}`);
    
    // Notify other users about online status
    socket.broadcast.emit('user_status', { username, status: 'online' });
  });

  socket.on('typing', ({ receiver, isTyping }) => {
    const receiverSocketId = userSockets.get(receiver);
    if (receiverSocketId) {
      const sender = Array.from(userSockets.entries())
        .find(([_, id]) => id === socket.id)?.[0];
      
      if (sender) {
        io.to(receiverSocketId).emit('typing', {
          username: sender,
          isTyping
        });
      }
    }
  });

  socket.on('send_message', async (messageData) => {
    try {
      const { Message } = require('./models/Message');
      const newMessage = new Message({
        sender: messageData.sender,
        receiver: messageData.receiver,
        message: messageData.message,
        timestamp: new Date(),
        status: 'sent'
      });
      await newMessage.save();

      // Send to receiver if online
      const receiverSocketId = userSockets.get(messageData.receiver);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('receive_message', {
          ...messageData,
          _id: newMessage._id,
          timestamp: newMessage.timestamp,
          status: 'delivered'
        });
        await Message.findByIdAndUpdate(newMessage._id, { status: 'delivered' });
      }

      // Send back to sender
      socket.emit('receive_message', {
        ...messageData,
        _id: newMessage._id,
        timestamp: newMessage.timestamp,
        status: newMessage.status
      });
    } catch (error) {
      console.error('Message save error:', error);
    }
  });

  socket.on('mark_as_read', async ({ messageId, sender }) => {
    try {
      const { Message } = require('./models/Message');
      await Message.findByIdAndUpdate(messageId, { status: 'read' });
      
      // Notify the sender that their message was read
      const senderSocketId = userSockets.get(sender);
      if (senderSocketId) {
        io.to(senderSocketId).emit('message_read', { messageId });
      }
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  });

  socket.on('messages_deleted', ({ deletedMessages, receiver }) => {
    const receiverSocketId = userSockets.get(receiver);
    if (receiverSocketId) {
      // Immediately emit the deletion event to the receiver
      io.to(receiverSocketId).emit('messages_deleted', { deletedMessages });
    }
  });

  socket.on('callUser', ({ userToCall, signalData, from }) => {
    const receiverSocketId = userSockets.get(userToCall);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('callUser', {
        signal: signalData,
        from
      });
    }
  });

  socket.on('answerCall', ({ signal, to }) => {
    const receiverSocketId = userSockets.get(to);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('callAccepted', signal);
    }
  });

  socket.on('rejectCall', ({ user }) => {
    const receiverSocketId = userSockets.get(user);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('callRejected');
    }
  });

  socket.on('endCall', ({ user }) => {
    const receiverSocketId = userSockets.get(user);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('endCall');
    }
  });

  socket.on('disconnect', () => {
    // Update user's last seen and remove from active users
    for (const [username, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        userSockets.delete(username);
        const { User } = require('./models/User');
        User.findOneAndUpdate(
          { username },
          { lastSeen: new Date() }
        ).exec();

        // Notify other users about offline status
        socket.broadcast.emit('user_status', {
          username,
          status: 'offline',
          lastSeen: new Date()
        });
        break;
      }
    }
    console.log('User disconnected:', socket.id);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 