// Initialize global variables
let socket;
let map;
let myMarker;
let markers = {};
let myPosition = null;
let userData = {
  id: null,
  name: '',
  circleCode: null
};

// Color palette for user markers
const colorPalette = [
  '#4285f4', '#ea4335', '#fbbc05', '#34a853',
  '#ff6d01', '#46bdc6', '#7baaf7', '#f07b72',
  '#fcd04f', '#71c287'
];

// DOM elements
const elements = {
  loginPanel: document.getElementById('login-panel'),
  circlePanel: document.getElementById('circle-panel'),
  nameInput: document.getElementById('name'),
  circleCodeInput: document.getElementById('circle-code'),
  displayCode: document.getElementById('display-code'),
  createCircleBtn: document.getElementById('create-circle-btn'),
  joinCircleBtn: document.getElementById('join-circle-btn'),
  leaveCircleBtn: document.getElementById('leave-circle-btn'),
  membersContainer: document.getElementById('members-container'),
  copyCodeBtn: document.getElementById('copy-code-btn'),
  centerMapBtn: document.getElementById('center-map-btn'),
  updateLocationBtn: document.getElementById('update-location-btn'),
  notifications: document.getElementById('notifications')
};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  // Check localStorage for existing session
  loadFromLocalStorage();
  
  // Initialize map
  initializeMap();
  
  // Set up event listeners
  setupEventListeners();
});

// Load saved data from localStorage
function loadFromLocalStorage() {
  const savedData = localStorage.getItem('geoSquadData');
  
  if (savedData) {
    try {
      const data = JSON.parse(savedData);
      userData = data;
      
      if (userData.name) {
        elements.nameInput.value = userData.name;
      }
      
      if (userData.id && userData.circleCode) {
        // We have a saved session, try to reconnect
        connectSocket();
        socket.emit('joinCircle', {
          circleCode: userData.circleCode,
          userData: {
            name: userData.name,
            location: myPosition
          }
        });
      }
    } catch (error) {
      console.error('Error loading data from localStorage:', error);
      localStorage.removeItem('geoSquadData');
    }
  }
}

// Save data to localStorage
function saveToLocalStorage() {
  localStorage.setItem('geoSquadData', JSON.stringify(userData));
}

// Initialize the map
function initializeMap() {
  map = L.map('map').setView([0, 0], 2);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);
  
  // Get user's current position
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        myPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        
        map.setView([myPosition.lat, myPosition.lng], 13);
        
        if (myMarker) {
          myMarker.setLatLng([myPosition.lat, myPosition.lng]);
        }
      },
      (error) => {
        showNotification('Error getting your location. Please enable location services.', 'error');
        console.error('Error getting location:', error);
      }
    );
  } else {
    showNotification('Geolocation is not supported by your browser.', 'error');
  }
}

// Set up event listeners
function setupEventListeners() {
  // Create circle button
  elements.createCircleBtn.addEventListener('click', () => {
    const name = elements.nameInput.value.trim();
    
    if (!name) {
      showNotification('Please enter your name', 'error');
      return;
    }
    
    userData.name = name;
    
    if (!myPosition) {
      showNotification('Waiting for your location. Please try again.', 'info');
      return;
    }
    
    connectSocket();
    socket.emit('createCircle', {
      name,
      location: myPosition
    });
  });
  
  // Join circle button
  elements.joinCircleBtn.addEventListener('click', () => {
    const name = elements.nameInput.value.trim();
    const circleCode = elements.circleCodeInput.value.trim().toUpperCase();
    
    if (!name) {
      showNotification('Please enter your name', 'error');
      return;
    }
    
    if (!circleCode || circleCode.length !== 6) {
      showNotification('Please enter a valid 6-digit code', 'error');
      return;
    }
    
    userData.name = name;
    
    if (!myPosition) {
      showNotification('Waiting for your location. Please try again.', 'info');
      return;
    }
    
    connectSocket();
    socket.emit('joinCircle', {
      circleCode,
      userData: {
        name,
        location: myPosition
      }
    });
  });
  
  // Leave circle button
  elements.leaveCircleBtn.addEventListener('click', () => {
    if (socket) {
      socket.emit('leaveCircle');
    }
    
    resetApp();
  });
  
  // Copy code button
  elements.copyCodeBtn.addEventListener('click', () => {
    const code = elements.displayCode.textContent;
    navigator.clipboard.writeText(code)
      .then(() => showNotification('Circle code copied to clipboard!', 'success'))
      .catch(err => console.error('Could not copy code: ', err));
  });
  
  // Center map button
  elements.centerMapBtn.addEventListener('click', () => {
    if (myPosition) {
      map.setView([myPosition.lat, myPosition.lng], 13);
    }
  });
  
  // Update location button
  elements.updateLocationBtn.addEventListener('click', () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          myPosition = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          
          if (myMarker) {
            myMarker.setLatLng([myPosition.lat, myPosition.lng]);
          }
          
          if (socket && userData.id) {
            socket.emit('updateLocation', myPosition);
          }
          
          showNotification('Your location has been updated', 'success');
        },
        (error) => {
          showNotification('Error updating your location', 'error');
          console.error('Error getting updated location:', error);
        }
      );
    }
  });
}

// Connect to the Socket.IO server
function connectSocket() {
  if (socket) return;
  
  socket = io();
  
  // Socket event handlers
  socket.on('connect', () => {
    console.log('Connected to server');
  });
  
  socket.on('circleCreated', (data) => {
    handleJoinedCircle(data);
    showNotification('Circle created successfully!', 'success');
  });
  
  socket.on('joinedCircle', (data) => {
    handleJoinedCircle(data);
    showNotification('Joined the circle successfully!', 'success');
  });
  
  socket.on('memberJoined', (data) => {
    updateMembersList(data.circle);
    addMarkerForMember(data.newMember);
    showNotification(`${data.newMember.name} joined the circle`, 'info');
  });
  
  socket.on('memberLeft', (data) => {
    updateMembersList(data.circle);
    removeMarkerForMember(data.userId);
    showNotification(`A member left the circle`, 'info');
  });
  
  socket.on('locationUpdated', (data) => {
    updateMembersList(data.circle);
    updateMarkerPosition(data.userId, data.location);
  });
  
  socket.on('circleEnded', () => {
    showNotification('The circle has ended', 'info');
    resetApp();
  });
  
  socket.on('error', (error) => {
    showNotification(error.message, 'error');
  });
  
  socket.on('disconnect', () => {
    console.log('Disconnected from server');
  });
}

// Handle successful circle join/creation
function handleJoinedCircle(data) {
  userData.id = data.userId;
  userData.circleCode = data.circleCode;
  saveToLocalStorage();
  
  elements.displayCode.textContent = data.circleCode;
  elements.loginPanel.classList.add('hidden');
  elements.circlePanel.classList.remove('hidden');
  
  updateMembersList(data.circle);
  initializeMarkers(data.circle);
}

// Update the members list UI
function updateMembersList(circle) {
  elements.membersContainer.innerHTML = '';
  
  const members = Object.values(circle.members);
  members.forEach((member, index) => {
    const isMe = member.id === userData.id;
    const colorIndex = index % colorPalette.length;
    const color = colorPalette[colorIndex];
    
    const lastSeen = new Date(member.lastUpdated);
    const timeAgo = getTimeAgo(lastSeen);
    
    const listItem = document.createElement('li');
    listItem.className = 'member-item';
    listItem.innerHTML = `
      <div class="member-color" style="background-color: ${color}"></div>
      <div class="member-info">
        <div class="member-name">${member.name}${isMe ? ' (You)' : ''}</div>
        <div class="member-status">Last updated: ${timeAgo}</div>
      </div>
    `;
    
    elements.membersContainer.appendChild(listItem);
  });
}

// Initialize markers for all members
function initializeMarkers(circle) {
  // Clear existing markers
  for (const id in markers) {
    map.removeLayer(markers[id]);
  }
  markers = {};
  
  // Add markers for all members
  const members = Object.values(circle.members);
  members.forEach((member, index) => {
    if (!member.location) return;
    
    const colorIndex = index % colorPalette.length;
    const color = colorPalette[colorIndex];
    
    const isMe = member.id === userData.id;
    const marker = L.marker([member.location.lat, member.location.lng], {
      icon: L.divIcon({
        className: 'custom-marker',
        html: `<div style="background-color: ${color}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      })
    }).addTo(map);
    
    marker.bindPopup(member.name + (isMe ? ' (You)' : ''));
    markers[member.id] = marker;
    
    if (isMe) {
      myMarker = marker;
      map.setView([member.location.lat, member.location.lng], 13);
    }
  });
}

// Add a marker for a new member
function addMarkerForMember(member) {
  if (!member.location) return;
  
  // Find an available color
  const memberIds = Object.keys(markers);
  const colorIndex = memberIds.length % colorPalette.length;
  const color = colorPalette[colorIndex];
  
  const marker = L.marker([member.location.lat, member.location.lng], {
    icon: L.divIcon({
      className: 'custom-marker',
      html: `<div style="background-color: ${color}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    })
  }).addTo(map);
  
  marker.bindPopup(member.name);
  markers[member.id] = marker;
}

// Update a member's marker position
function updateMarkerPosition(userId, location) {
  if (!location || !markers[userId]) return;
  
  markers[userId].setLatLng([location.lat, location.lng]);
}

// Remove a member's marker
function removeMarkerForMember(userId) {
  if (markers[userId]) {
    map.removeLayer(markers[userId]);
    delete markers[userId];
  }
}

// Reset the application state
function resetApp() {
  // Clear user data
  userData = {
    id: null,
    name: userData.name, // Keep the name
    circleCode: null
  };
  
  // Update localStorage
  saveToLocalStorage();
  
  // Reset UI
  elements.loginPanel.classList.remove('hidden');
  elements.circlePanel.classList.add('hidden');
  elements.circleCodeInput.value = '';
  
  // Clear markers
  for (const id in markers) {
    if (markers[id] !== myMarker) {
      map.removeLayer(markers[id]);
    }
  }
  markers = {};
  if (myMarker) {
    markers[userData.id] = myMarker;
  }
  
  // Disconnect socket
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// Show a notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  elements.notifications.appendChild(notification);
  
  // Remove notification after 5 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      elements.notifications.removeChild(notification);
    }, 300);
  }, 5000);
}

// Get time ago in human-readable format
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) {
    return 'Just now';
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(seconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
}

// Set up periodic location updates
setInterval(() => {
  if (navigator.geolocation && socket && userData.id) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        myPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        
        if (myMarker) {
          myMarker.setLatLng([myPosition.lat, myPosition.lng]);
        }
        
        socket.emit('updateLocation', myPosition);
      },
      (error) => {
        console.error('Error updating background location:', error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }
}, 60000); // Update every minute