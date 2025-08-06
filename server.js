const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store active circles and their members (in-memory for this example)
// In production, you'd use a database
const circles = {};

io.on('connection', (socket) => {
  console.log('New client connected');
  
  // Create a new circle
  socket.on('createCircle', (userData) => {
    const circleCode = generateCircleCode();
    const userId = uuidv4();
    
    circles[circleCode] = {
      owner: userId,
      members: {
        [userId]: {
          id: userId,
          name: userData.name,
          location: userData.location,
          lastUpdated: new Date()
        }
      }
    };
    
    socket.join(circleCode);
    socket.circleCode = circleCode;
    socket.userId = userId;
    
    socket.emit('circleCreated', { 
      circleCode,
      userId,
      circle: circles[circleCode]
    });
  });
  
  // Join an existing circle
  socket.on('joinCircle', (data) => {
    const { circleCode, userData } = data;
    
    if (!circles[circleCode]) {
      return socket.emit('error', { message: 'Circle not found' });
    }
    
    const userId = uuidv4();
    
    circles[circleCode].members[userId] = {
      id: userId,
      name: userData.name,
      location: userData.location,
      lastUpdated: new Date()
    };
    
    socket.join(circleCode);
    socket.circleCode = circleCode;
    socket.userId = userId;
    
    socket.emit('joinedCircle', { 
      circleCode,
      userId,
      circle: circles[circleCode]
    });
    
    // Notify other members
    socket.to(circleCode).emit('memberJoined', { 
      newMember: circles[circleCode].members[userId],
      circle: circles[circleCode]
    });
  });
  
  // Update location
  socket.on('updateLocation', (location) => {
    if (!socket.circleCode || !socket.userId) return;
    
    const circle = circles[socket.circleCode];
    if (!circle || !circle.members[socket.userId]) return;
    
    circle.members[socket.userId].location = location;
    circle.members[socket.userId].lastUpdated = new Date();
    
    // Broadcast to all members in the circle
    io.to(socket.circleCode).emit('locationUpdated', {
      userId: socket.userId,
      location,
      circle
    });
  });
  
  // Leave circle
  socket.on('leaveCircle', () => {
    handleDisconnect();
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected');
    handleDisconnect();
  });
  
  function handleDisconnect() {
    if (!socket.circleCode || !socket.userId) return;
    
    const circle = circles[socket.circleCode];
    if (!circle) return;
    
    // Remove the member
    delete circle.members[socket.userId];
    
    // If it was the owner or the circle is empty, delete the circle
    if (circle.owner === socket.userId || Object.keys(circle.members).length === 0) {
      io.to(socket.circleCode).emit('circleEnded');
      delete circles[socket.circleCode];
    } else {
      // Notify remaining members
      socket.to(socket.circleCode).emit('memberLeft', {
        userId: socket.userId,
        circle
      });
    }
    
    socket.leave(socket.circleCode);
  }
});

// Generate a 6-character code for circles
function generateCircleCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  // Make sure it's unique
  if (circles[code]) {
    return generateCircleCode();
  }
  
  return code;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});