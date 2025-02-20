const express = require('express');
const router = express.Router();
const { User } = require('../models/User');
const https = require('https');

// Get all users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username lastSeen');
    res.json(users);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }

    // Create new user
    const user = new User({ username, password });
    await user.save();
    
    res.status(201).json({ success: true, message: 'User registered successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Find user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
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

// Get ICE servers from Xirsys
router.get('/ice-servers', async (req, res) => {
  try {
    const options = {
      host: "global.xirsys.net",
      path: "/_turn/MyFirstApp",
      method: "PUT",
      headers: {
        "Authorization": "Basic " + Buffer.from(process.env.XIRSYS_CREDENTIALS).toString("base64"),
        "Content-Type": "application/json",
        "Content-Length": JSON.stringify({ format: "urls" }).length
      }
    };

    const httpreq = https.request(options, function(httpres) {
      let str = "";
      httpres.on("data", function(data){ str += data; });
      httpres.on("error", function(e){ 
        console.error("Xirsys error:", e);
        res.status(500).json({ error: "Failed to fetch ICE servers" });
      });
      httpres.on("end", function(){ 
        try {
          const iceServers = JSON.parse(str);
          res.json(iceServers);
        } catch (e) {
          console.error("Failed to parse ICE servers:", e);
          res.status(500).json({ error: "Failed to parse ICE servers" });
        }
      });
    });

    httpreq.on("error", function(e){ 
      console.error("Xirsys request error:", e);
      res.status(500).json({ error: "Failed to connect to TURN server" });
    });

    httpreq.write(JSON.stringify({ format: "urls" }));
    httpreq.end();
  } catch (error) {
    console.error("ICE servers error:", error);
    res.status(500).json({ error: "Failed to get ICE servers" });
  }
});

module.exports = router; 