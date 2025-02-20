const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: String,
    required: true,
    ref: 'User',
  },
  receiver: {
    type: String,
    required: true,
    ref: 'User',
  },
  message: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent',
  },
});

const Message = mongoose.model('Message', messageSchema);

module.exports = { Message }; 