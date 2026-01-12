const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');
const roomMembers = {};
const app = express();
const server = http.createServer(app);
const io = new Server(server);

//for multiple languages

app.use(express.json());
const clientId= "7468cad515417d13d64688721800616";       
const clientSecret = "f261627ba48a7dff3535e0de97e4cfee85554023e07ed23420eb19ce1b4d6cc6";// ✅ REPLACE with your JDoodle clientSecret
app.post('/api/run', async (req, res) => {
  const { script, language, versionIndex } = req.body;

  try {
    const response = await fetch('https://api.jdoodle.com/v1/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        clientSecret,
        script,
        language,
        versionIndex
      })
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('JDoodle API error:', err);
    res.status(500).json({ error: 'JDoodle execution failed' });
  }
});



//
//
// Database connection setup
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',  // Replace with your MySQL username
  password: 'vamshi',  // Replace with your MySQL password
  database: 'collab'  // Replace with your database name
});

// Connect to MySQL database
db.connect((err) => {
  if (err) {
    console.error('Database connection failed: ' + err.stack);
    return;
  }
  console.log('Connected to the database');
});

// Middleware setup
app.use(express.static('public'));  // Serve static files
app.use(bodyParser.json());  // Parse JSON body

// Handle anonymous user session
app.get('/collaborative-editor', (req, res) => {
  const anonymousUserId = uuidv4();  // Generate unique ID for anonymous users
  console.log(`Starting collaborative editor session for anonymous user: ${anonymousUserId}`);
  // Redirect to the collaborative editor with anonymous user
  res.render('editor', { userId: anonymousUserId });
});

// Sign-up endpoint
app.post('/signup', (req, res) => {
  const { username, password, profileName } = req.body;
  
  // Check if user already exists
  db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Database error during sign-up.' });
    }
    if (results.length > 0) {
      return res.status(400).json({ message: 'Username already exists.' });
    }

    // Hash password before saving it
    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) {
        return res.status(500).json({ message: 'Error hashing password.' });
      }

      // Insert the new user into the database
      db.query('INSERT INTO users (username, password, profile_name) VALUES (?, ?, ?)', 
        [username, hashedPassword, profileName], 
        (err, result) => {
          if (err) {
            return res.status(500).json({ message: 'Error creating user.' });
          }
          res.status(200).json({ message: 'User created successfully!' });
        });
    });
  });
});

// Login endpoint
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Fetch user details by username
  db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Database error during login.' });
    }
    if (results.length === 0) {
      return res.status(400).json({ message: 'Invalid username or password.' });
    }

    // Compare the entered password with the stored hashed password
    bcrypt.compare(password, results[0].password, (err, isMatch) => {
      if (err) {
        return res.status(500).json({ message: 'Error comparing passwords.' });
      }
      if (!isMatch) {
        return res.status(400).json({ message: 'Invalid username or password.' });
      }
      
      // Successful login
      res.status(200).json({ message: 'Login successful', profileName: results[0].profile_name });

    });
  });
});

// Profile update endpoint
app.post('/updateProfile', (req, res) => {
  const { userId, profileName } = req.body;
  
  db.query('UPDATE users SET profile_name = ? WHERE id = ?', [profileName, userId], (err, result) => {
    if (err) {
      return res.status(500).json({ message: 'Error updating profile.' });
    }
    res.status(200).json({ message: 'Profile updated successfully!' });
  });
});

// Socket.io logic for real-time collaborative editing and chat
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // Handle room creation
  socket.on('createRoom', ({roomId,username}) => {
    socket.join(roomId);
    roomMembers[roomId] = roomMembers[roomId] || new Set();
    roomMembers[roomId].add(username);

    io.to(roomId).emit('updateMembers', Array.from(roomMembers[roomId]));
    console.log(`Room ${roomId} created and user ${socket.id} joined.`);
    socket.emit('roomCreated', roomId);
  });

  // Handle joining a room
  socket.on('joinRoom', ({ roomId, username }) => {
    socket.join(roomId);
    roomMembers[roomId] = roomMembers[roomId] || new Set();
    roomMembers[roomId].add(username);
  
    io.to(roomId).emit('updateMembers', Array.from(roomMembers[roomId]));
    console.log(`${username} joined room ${roomId}`);
  });
  

  socket.on('leaveRoom', ({ roomId, username }) => {
    if (roomMembers[roomId]) {
      roomMembers[roomId].delete(username);
      io.to(roomId).emit('updateMembers', Array.from(roomMembers[roomId]));
      if (roomMembers[roomId].size === 0) delete roomMembers[roomId];
    }
    socket.leave(roomId);
    console.log(`${username} left room ${roomId}`);
  });

  // Handle code changes
  socket.on('codeChange', ({ roomId, code }) => {
    if (roomId && code !== undefined) {
      console.log(`💻 Code changed in room ${roomId}`);
      socket.to(roomId).emit('codeChange', { code }); // frontend expects this
    }
  });
  // Handle chat messages
  
 
  
  // FIXED: Emit the right structure

 socket.on('chatMessage', ({ roomId, sender, message }) => {
  if (roomId && message && sender) {
    io.to(roomId).emit('chatMessage', { sender, message });
  }
});


  // Handle cursor movements
  socket.on('cursorMove', ({ roomId, cursor }) => {
    if (roomId && cursor) {
      socket.to(roomId).emit('showCursor', cursor);
    }
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    console.log('❎ User disconnected:', socket.id);
  });
});

// Start the server
const PORT = process.env.PORT || 9696;
server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
