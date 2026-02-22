const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Make io accessible in routes
app.set('io', io);

// --- API Routes ---
app.use('/api/auth', require('./routes/auth'));
app.use('/api/food', require('./routes/food'));
app.use('/api/users', require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/ai', require('./routes/ai'));

// --- SPA Catch-all: serve index1.html ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index1.html'));
});

// --- Socket.IO ---
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // Join user's personal room
  socket.on('join', (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined their room`);
  });

  // Join food-specific room (for donor-receiver sync)
  socket.on('join_food_room', (foodId) => {
    socket.join(`food_${foodId}`);
    console.log(`Socket ${socket.id} joined food room: food_${foodId}`);
  });

  // Leave food room
  socket.on('leave_food_room', (foodId) => {
    socket.leave(`food_${foodId}`);
    console.log(`Socket ${socket.id} left food room: food_${foodId}`);
  });

  // Receiver shares their live location → relay to the food room (donor will see it)
  socket.on('share_location', (data) => {
    // data = { foodId, lat, lng, accuracy }
    if (data.foodId) {
      socket.to(`food_${data.foodId}`).emit('receiver_location', {
        foodId: data.foodId,
        lat: data.lat,
        lng: data.lng,
        accuracy: data.accuracy,
        timestamp: Date.now()
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

// --- MongoDB Connection & Server Start ---
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/foodshare';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });
