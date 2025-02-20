const express = require('express');
const router = express.Router();
const { Message } = require('../models/Message');

// Get messages between two users
router.get('/messages/:sender/:receiver', async (req, res) => {
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

// Delete multiple messages
router.delete('/messages', async (req, res) => {
  try {
    const { messageIds, userId } = req.body;

    // Verify that all messages belong to the user making the request
    const messages = await Message.find({ _id: { $in: messageIds } });
    const unauthorized = messages.some(msg => msg.sender !== userId);

    if (unauthorized) {
      return res.status(403).json({ 
        success: false, 
        message: 'You can only delete your own messages' 
      });
    }

    await Message.deleteMany({ _id: { $in: messageIds } });

    // Return deleted message details for real-time updates
    const deletedMessages = messages.map(msg => ({
      _id: msg._id,
      sender: msg.sender,
      receiver: msg.receiver
    }));

    res.json({ 
      success: true, 
      message: 'Messages deleted successfully',
      deletedMessages
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete messages' });
  }
});

// Clear chat between two users
router.delete('/messages/clear-chat', async (req, res) => {
  try {
    const { userId, otherUserId } = req.body;

    // Find all messages between the two users where the requester is the sender
    const messages = await Message.find({
      sender: userId,
      receiver: otherUserId
    });

    await Message.deleteMany({
      sender: userId,
      receiver: otherUserId
    });

    // Return deleted message details for real-time updates
    const deletedMessages = messages.map(msg => ({
      _id: msg._id,
      sender: msg.sender,
      receiver: msg.receiver
    }));

    res.json({ 
      success: true, 
      message: 'Chat cleared successfully',
      deletedMessages
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to clear chat' });
  }
});

module.exports = router; 