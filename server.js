const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const app = express();
const PORT = 3000;

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// File upload setup
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + '-' + file.originalname.replace(/[^a-z0-9_.-]/gi, '_'));
  }
});
const upload = multer({ storage });
app.use('/uploads', express.static(uploadDir));

// Data files with directory path
const USERS_FILE = path.join(dataDir, 'users.json');
const CONTACTS_FILE = path.join(dataDir, 'contacts.json');
const GROUPS_FILE = path.join(dataDir, 'groups.json');
const MESSAGES_FILE = path.join(dataDir, 'messages.json');
const TYPING_FILE = path.join(dataDir, 'typing.json');

// Initialize data files if they don't exist
[USERS_FILE, CONTACTS_FILE, GROUPS_FILE, MESSAGES_FILE, TYPING_FILE].forEach(file => {
  if (!fs.existsSync(file)) fs.writeFileSync(file, '{}', 'utf8');
});

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.static('public'));
app.use(express.json());
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Helper functions
function readData(file) {
  try {
    const data = fs.readFileSync(file, 'utf8');
    return data ? JSON.parse(data) : {};
  } catch (err) {
    console.error(`Error reading ${file}:`, err);
    return {};
  }
}

function writeData(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Error writing to ${file}:`, err);
    throw err;
  }
}

// Authentication middleware
function requireAuth(req, res, next) {
  if (!req.session.username) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  next();
}

// Who am I endpoint
app.get('/api/whoami', (req, res) => {
  const username = req.session.username;
  if (username) {
    res.json({ username });
  } else {
    res.json({ username: null });
  }
});

// User Registration
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    if (username.length < 3 || password.length < 6) {
      return res.status(400).json({ success: false, error: 'Username must be at least 3 characters and password at least 6 characters' });
    }

    const users = readData(USERS_FILE);

    if (users[username]) {
      return res.status(409).json({ success: false, error: 'Username already exists' });
    }

    const hash = await bcrypt.hash(password, 10);
    users[username] = { password: hash };
    writeData(USERS_FILE, users);

    req.session.username = username;
    res.json({ success: true });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// User Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    const users = readData(USERS_FILE);
    const user = users[username];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    req.session.username = username;
    res.json({ success: true });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// User Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// Friend Request System - Enhanced
app.post('/api/contacts/request', requireAuth, async (req, res) => {
  try {
    const fromUser = req.session.username;
    const toUser = req.body.username;

    if (!toUser) {
      return res.status(400).json({ success: false, error: 'Username is required' });
    }

    if (fromUser === toUser) {
      return res.status(400).json({ success: false, error: 'Cannot send request to yourself' });
    }

    const contactsData = readData(CONTACTS_FILE);

    // Initialize user data if not exists
    contactsData[fromUser] = contactsData[fromUser] || { contacts: [], outgoingRequests: [], incomingRequests: [] };
    contactsData[toUser] = contactsData[toUser] || { contacts: [], outgoingRequests: [], incomingRequests: [] };

    // Check if already friends
    if (contactsData[fromUser].contacts.includes(toUser)) {
      return res.status(400).json({ success: false, error: 'User is already a contact' });
    }

    // Check for existing request
    const existingRequest = contactsData[toUser].incomingRequests.find(r => r.from === fromUser);
    if (existingRequest) {
      return res.status(400).json({ success: false, error: 'Request already sent' });
    }

    // Create request
    const requestId = Date.now().toString();
    contactsData[fromUser].outgoingRequests.push({ to: toUser, id: requestId });
    contactsData[toUser].incomingRequests.push({ from: fromUser, id: requestId });

    writeData(CONTACTS_FILE, contactsData);
    res.json({ success: true });
  } catch (error) {
    console.error('Friend request error:', error);
    res.status(500).json({ success: false, error: 'Failed to send friend request' });
  }
});

// Accept/Reject Friend Request
app.post('/api/contacts/request/:requestId', requireAuth, async (req, res) => {
  try {
    const user = req.session.username;
    const requestId = req.params.requestId;
    const { action } = req.body; // 'accept' or 'reject'

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    const contactsData = readData(CONTACTS_FILE);

    if (!contactsData[user]) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const requestIndex = contactsData[user].incomingRequests.findIndex(r => r.id === requestId);
    if (requestIndex === -1) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    const request = contactsData[user].incomingRequests[requestIndex];
    const fromUser = request.from;

    // Remove the request
    contactsData[user].incomingRequests.splice(requestIndex, 1);

    // Remove from sender's outgoing requests
    if (contactsData[fromUser]?.outgoingRequests) {
      const senderOutgoingIndex = contactsData[fromUser].outgoingRequests.findIndex(r => r.id === requestId);
      if (senderOutgoingIndex !== -1) {
        contactsData[fromUser].outgoingRequests.splice(senderOutgoingIndex, 1);
      }
    }

    if (action === 'accept') {
      // Add to each other's contacts
      contactsData[user].contacts = [...new Set([...contactsData[user].contacts, fromUser])];
      contactsData[fromUser] = contactsData[fromUser] || { contacts: [], outgoingRequests: [], incomingRequests: [] };
      contactsData[fromUser].contacts = [...new Set([...contactsData[fromUser].contacts, user])];
    }

    writeData(CONTACTS_FILE, contactsData);
    res.json({ success: true });
  } catch (error) {
    console.error('Request processing error:', error);
    res.status(500).json({ success: false, error: 'Failed to process request' });
  }
});

// Get Contacts, Groups, and Requests
app.get('/api/contacts', requireAuth, (req, res) => {
  try {
    const username = req.session.username;
    const contactsData = readData(CONTACTS_FILE);
    const groupsData = readData(GROUPS_FILE);

    const userData = contactsData[username] || { contacts: [], outgoingRequests: [], incomingRequests: [] };

    // Groups: Show groups where user is a member
    const groups = [];
    Object.entries(groupsData).forEach(([groupId, group]) => {
      if (group.members && group.members.includes(username)) {
        groups.push({ id: groupId, name: group.name });
      }
    });

    // Friend Requests
    const requests = (userData.incomingRequests || []).map(r => ({
      from: r.from,
      id: r.id
    }));

    res.json({
      contacts: userData.contacts || [],
      groups,
      requests
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get contacts' });
  }
});

// Send Message (Contact) WITH FILE SUPPORT
app.post('/api/conversations/:contact', requireAuth, upload.single('file'), (req, res) => {
  const from = req.session.username;
  const to = req.params.contact;
  const { message } = req.body;
  let fileUrl = null;
  if (req.file) fileUrl = '/uploads/' + req.file.filename;
  if (!message && !fileUrl) return res.status(400).json({ error: "Message or file required" });

  const messagesData = readData(MESSAGES_FILE);
  const key = [from, to].sort().join('__');
  messagesData[key] = messagesData[key] || [];
  messagesData[key].push({ sender: from, message, file: fileUrl });
  writeData(MESSAGES_FILE, messagesData);

  res.json({ success: true });
});

// Get Messages (Contact)
app.get('/api/conversations/:contact', requireAuth, (req, res) => {
  const from = req.session.username;
  const to = req.params.contact;
  const messagesData = readData(MESSAGES_FILE);
  const key = [from, to].sort().join('__');
  res.json(messagesData[key] || []);
});

// Create Group
app.post('/api/groups', requireAuth, (req, res) => {
  const { name, members } = req.body;
  const username = req.session.username;
  if (!name || !Array.isArray(members) || members.length < 1) {
    return res.status(400).json({ success: false, error: "Name and at least one member required" });
  }
  const groupsData = readData(GROUPS_FILE);
  const id = Date.now().toString();
  const groupMembers = Array.from(new Set([username, ...members]));
  groupsData[id] = { name, members: groupMembers };
  writeData(GROUPS_FILE, groupsData);
  res.json({ success: true, groupId: id });
});

// Get Group Messages
app.get('/api/groups/:groupId/messages', requireAuth, (req, res) => {
  const username = req.session.username;
  const groupId = req.params.groupId;
  const groupsData = readData(GROUPS_FILE);
  if (!groupsData[groupId] || !groupsData[groupId].members.includes(username)) {
    return res.status(403).json({ success: false, error: "Not a group member" });
  }
  const messagesData = readData(MESSAGES_FILE);
  const key = `group__${groupId}`;
  res.json(messagesData[key] || []);
});

// Send Group Message WITH FILE SUPPORT
app.post('/api/groups/:groupId/messages', requireAuth, upload.single('file'), (req, res) => {
  const username = req.session.username;
  const groupId = req.params.groupId;
  const { message } = req.body;
  let fileUrl = null;
  if (req.file) fileUrl = '/uploads/' + req.file.filename;
  if (!message && !fileUrl) return res.status(400).json({ error: "Message or file required" });
  const groupsData = readData(GROUPS_FILE);
  if (!groupsData[groupId] || !groupsData[groupId].members.includes(username)) {
    return res.status(403).json({ success: false, error: "Not a group member" });
  }
  const messagesData = readData(MESSAGES_FILE);
  const key = `group__${groupId}`;
  messagesData[key] = messagesData[key] || [];
  messagesData[key].push({ sender: username, message, file: fileUrl });
  writeData(MESSAGES_FILE, messagesData);
  res.json({ success: true });
});

// --- EDIT/DELETE MESSAGE ---
app.put('/api/messages/:chatType/:chatId/:msgIdx', requireAuth, (req, res) => {
  const { chatType, chatId, msgIdx } = req.params;
  const { message } = req.body;
  const username = req.session.username;
  const messagesData = readData(MESSAGES_FILE);
  let key;
  if (chatType === 'contact') {
    key = [username, chatId].sort().join('__');
  } else {
    key = `group__${chatId}`;
  }
  const msg = messagesData[key] && messagesData[key][msgIdx];
  if (!msg || msg.sender !== username) return res.status(403).json({ error: "Can't edit" });
  msg.message = message;
  writeData(MESSAGES_FILE, messagesData);
  res.json({ success: true });
});

app.delete('/api/messages/:chatType/:chatId/:msgIdx', requireAuth, (req, res) => {
  const { chatType, chatId, msgIdx } = req.params;
  const username = req.session.username;
  const messagesData = readData(MESSAGES_FILE);
  let key;
  if (chatType === 'contact') {
    key = [username, chatId].sort().join('__');
  } else {
    key = `group__${chatId}`;
  }
  const msg = messagesData[key] && messagesData[key][msgIdx];
  if (!msg || msg.sender !== username) return res.status(403).json({ error: "Can't delete" });
  messagesData[key].splice(msgIdx, 1);
  writeData(MESSAGES_FILE, messagesData);
  res.json({ success: true });
});

// Typing Indicator (Contact)
app.post('/api/typing/:contact', requireAuth, (req, res) => {
  const from = req.session.username;
  const to = req.params.contact;
  const { typing } = req.body;
  const typingData = readData(TYPING_FILE);
  const key = [from, to].sort().join('__');
  typingData[key] = typingData[key] || {};
  typingData[key][from] = typing;
  writeData(TYPING_FILE, typingData);
  res.json({ success: true });
});
app.get('/api/typing/:contact', requireAuth, (req, res) => {
  const from = req.session.username;
  const to = req.params.contact;
  const typingData = readData(TYPING_FILE);
  const key = [from, to].sort().join('__');
  if (!typingData[key]) return res.json({ typing: false });
  const otherUser = (key.split('__').find(u => u !== from)) || to;
  if (!otherUser) return res.json({ typing: false });
  res.json({ typing: !!typingData[key][otherUser], user: otherUser });
});

// Typing Indicator (Group)
app.post('/api/groups/:groupId/typing', requireAuth, (req, res) => {
  const username = req.session.username;
  const groupId = req.params.groupId;
  const { typing } = req.body;
  const typingData = readData(TYPING_FILE);
  const key = `group__${groupId}`;
  typingData[key] = typingData[key] || {};
  typingData[key][username] = typing;
  writeData(TYPING_FILE, typingData);
  res.json({ success: true });
});
app.get('/api/groups/:groupId/typing', requireAuth, (req, res) => {
  const username = req.session.username;
  const groupId = req.params.groupId;
  const typingData = readData(TYPING_FILE);
  const key = `group__${groupId}`;
  if (!typingData[key]) return res.json({ typing: false });
  const others = Object.entries(typingData[key])
    .filter(([user, isTyping]) => user !== username && isTyping)
    .map(([user]) => user);
  if (others.length > 0) {
    res.json({ typing: true, user: others[0] });
  } else {
    res.json({ typing: false });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});