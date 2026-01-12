/*const { version } = require("uuid");*/

const socket = io();
let currentUser = null;
let currentRoom = null;
let editor = null;

document.addEventListener('DOMContentLoaded', () => {



// DOM elements
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const editorSection = document.getElementById('editorContainer');
const consoleOutput = document.getElementById('consoleOutput');
const chatBox = document.getElementById('chatBox');

const originalConsoleLog = console.log;
console.log = function (...args) {
  originalConsoleLog(...args); // still logs to browser console
  if (!consoleOutput) return;

  args.forEach(arg => {
    const line = document.createElement('div');
    line.textContent = '' + (typeof arg === 'object' ? JSON.stringify(arg) : arg);
    consoleOutput.appendChild(line);
  });

  consoleOutput.scrollTop = consoleOutput.scrollHeight;
};

const originalConsoleError = console.error;
console.error = function (...args) {
  originalConsoleError(...args);
  const consoleOutput = document.getElementById('consoleOutput');
  if (!consoleOutput) return;

  args.forEach(arg => {
    const line = document.createElement('div');
    line.style.color = 'red';
    line.textContent = '[error] ' + (typeof arg === 'object' ? JSON.stringify(arg) : arg);
    consoleOutput.appendChild(line);
  });

  consoleOutput.scrollTop = consoleOutput.scrollHeight;
};


// Show elements based on user actions
document.getElementById('loginBtn').onclick = () => showLogin();
document.getElementById('signupBtn').onclick = () => showSignup();
document.getElementById('guestBtn').onclick = () => startAsGuest();

document.getElementById('homeBtn').onclick = () => goHome();
document.getElementById('profileBtn').onclick = () => showProfile();
document.getElementById('logoutBtn').onclick = () => logout();

function showLogin() {
  document.querySelector('.auth-forms').style.display = 'block';
  loginForm.style.display = 'block';
  signupForm.style.display = 'none';
}

function showSignup() {
  document.querySelector('.auth-forms').style.display = 'block';
  signupForm.style.display = 'block';
  loginForm.style.display = 'none';
}


// Handle user actions
document.getElementById('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  
  const res = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  if (res.ok) {
    localStorage.setItem('currentUser', data.profileName);
    currentUser = data.profileName;  // ✅ FIXED to match server response
    afterLogin();


  }  
   else {
    alert(data.message);
  }
};

document.getElementById('signupForm').onsubmit = async (e) => {
  e.preventDefault();
  const username = document.getElementById('signupUsername').value;
  const password = document.getElementById('signupPassword').value;
  const profileName = document.getElementById('signupProfileName').value;
  
  const res = await fetch('/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, profileName }),
  });

  const data = await res.json();
  if (res.ok) {
    localStorage.setItem('currentUser', profileName);
    currentUser = profileName; // Use what user entered
    afterLogin();
  }
  
  else {
    alert(data.message);
  }
  
};

// Guest login
function startAsGuest() {
  currentUser = prompt("enter a name");
  username=currentUser
  localStorage.setItem('currentUser',username)
  afterLogin();
}

function afterLogin() {
  document.querySelector('.auth-buttons').style.display = 'none';
  document.querySelector('.auth-forms').style.display = 'none';
  editorSection.style.display = 'block';
  document.getElementById('chatSection').style.display = 'block';
  document.getElementById('consoleOutput').style.display = 'block';
  initializeEditor();

}

// Room functions
document.getElementById('createRoomBtn').onclick = () => createRoom();
document.getElementById('joinRoomBtn').onclick = () => joinRoom();
document.getElementById('leaveRoomBtn').onclick = () => leaveRoom();

function createRoom() {
  const roomId = document.getElementById('roomInput').value.trim();
  if (!roomId) return alert('Enter a room name');

  currentUser = localStorage.getItem('currentUser') || prompt('Enter your name');
  if (!currentUser) return alert('Username is required');

  currentRoom = roomId;

  // ✅ Emit both roomId and username to server
  socket.emit('createRoom', { roomId, username:currentUser});

  document.getElementById('roomNameDisplay').textContent = `${roomId}`;
}

function joinRoom() {
  const roomId = document.getElementById('roomInput').value.trim();
  if (!roomId) return alert('Enter a room name');
  currentUser = localStorage.getItem('currentUser') || prompt('Enter your name');

  if (!currentUser) return alert('Username is required');

 // localStorage.setItem('currentUser', currentUser); // Save for later

  currentRoom = roomId;
  socket.emit('joinRoom', {roomId,username:currentUser});
  document.getElementById('roomNameDisplay').textContent = roomId;
}

function leaveRoom() {
  if (!currentRoom) return;
  socket.emit('leaveRoom',  {roomId: currentRoom, username: currentUser});
  currentRoom = null;
  document.getElementById('roomNameDisplay').textContent = 'None';
  document.getElementById('memberList').innerHTML = '';
  document.getElementById('roomInfoPanel').style.display = 'none';
  alert('You left the room.');
  
}

// Initialize CodeMirror
function initializeEditor() {

  if (!editor) {
    editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
      lineNumbers: true,
      mode: 'javascript',
      theme: 'default',
    });

    // Broadcast code changes to room
    editor.on('change', () => {
      if (currentRoom) {
        socket.emit('codeChange', { roomId: currentRoom, code: editor.getValue() });
      }
    });
  }
}


// Running code
document.getElementById("runCodeBtn").onclick = () => {
  if (!editor) {
    console.error("CodeMirror editor not initialized yet.");
    return;
  }
  runCode();
};


/*function runCode() {
  const code = editor.getValue();
  try {
    const result = eval(code);
    appendToConsole(result);
  } catch (err) {
    appendToConsole(err);
  }
}*/


async function runCode() {
  const code = editor.getValue();
  const languageId = document.getElementById("languageSelect").value;

  const langMap = {
    "71": { language: "python3", versionIndex: "3" },
    "62": { language: "java", versionIndex: "3" },
    "63": { language: "cpp17", versionIndex: "0" },
    "52": { language: "c", versionIndex: "0" },
    "93": { language: "nodejs", versionIndex: "3" }
  };

  const selected = langMap[languageId];
  if (!selected) return appendToConsole("Invalid language selected.");

  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        script: code,
        language: selected.language,
        versionIndex: selected.versionIndex
      })
    });

    const result = await res.json();
    appendToConsole(result.output || "No output.");
  } catch (err) {
    console.error("Frontend error:", err);
    appendToConsole("Error running code.");
  }
}



// Console output
function appendToConsole(msg) {
  const line = document.createElement('div');
  line.textContent = msg;
  consoleOutput.appendChild(line);
}

document.getElementById('clearConsoleBtn').onclick = () => clearConsole();

function clearConsole() {
  consoleOutput.innerHTML = '<b>Console:</b>';
}

// Chat functionality
document.getElementById('sendChatBtn').onclick = () => sendChat();

function sendChat() {
  const chatMsg = document.getElementById('chatInput').value.trim();
  if (!chatMsg || !currentRoom) return;
  socket.emit('chatMessage', {
    roomId: currentRoom,     // changed from room → roomId
    sender: currentUser,
    message: chatMsg
  });
  document.getElementById('chatInput').value = '';
}


// ✅ Receiving chat messages
socket.on('chatMessage', (data) => {
  const msg = document.createElement('div');
  msg.textContent = `${data.sender}: ${data.message}`;
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
});

socket.on('codeChange', (data) => {
  if (editor && data.code !== editor.getValue()) {
    const currentCursor = editor.getCursor(); // preserve cursor position
    editor.setValue(data.code);
    editor.setCursor(currentCursor); // restore cursor position
  }
});

socket.on('updateMembers', (members) => {
  const memberList = document.getElementById('memberList');
  memberList.innerHTML = ''; // clear previous
  members.forEach(member => {
    const li = document.createElement('li');
    li.textContent = member;
    memberList.appendChild(li);
  });

  document.getElementById('roomInfoPanel').style.display = 'block';
});

socket.on('roomCreated', (roomId) => {
  document.getElementById('roomInfoPanel').style.display = 'block';
});


function goHome() {
  window.location.reload();
}

function showProfile() {
  // Example: You might want to fetch this from the server later
  document.getElementById('profileUsername').textContent = currentUser?.toLowerCase() || 'Guest';
  document.getElementById('profileDisplayName').textContent = currentUser || 'Guest';

  document.getElementById('profileModal').style.display = 'block';
}

document.getElementById('closeProfileModal').onclick = () => {
  document.getElementById('profileModal').style.display = 'none';
};

// Optional: Close modal when clicking outside
window.onclick = (event) => {
  const modal = document.getElementById('profileModal');
  if (event.target === modal) {
    modal.style.display = 'none';
  }
};

function logout() {
  window.location.reload();
}
});