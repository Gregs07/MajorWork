const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const db = require('./db');
const fs = require('fs');

const app = express();
const PORT = 3000;

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

// Authentication middleware
function requireAuth(req, res, next) {
  if (!req.session.username) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  next();
}

// --- E2EE public key endpoints ---
app.post('/api/publickey', (req, res) => {
  const {username, publicKey} = req.body;
  if (!username || !publicKey) return res.status(400).json({error: 'Missing username or publicKey'});
  db.run(
    `INSERT INTO public_keys (username, public_key) VALUES (?, ?)
     ON CONFLICT(username) DO UPDATE SET public_key = excluded.public_key`,
    [username, publicKey],
    err => err ? res.status(500).json({error: 'Failed'}) : res.json({ok: true})
  );
});
app.get('/api/publickey/:username', (req, res) => {
  db.get(`SELECT public_key FROM public_keys WHERE username = ?`, [req.params.username], (err, row) => {
    if (!row) return res.status(404).json({error: 'User public key not found'});
    res.json({publicKey: row.public_key});
  });
});

// Who am I endpoint
app.get('/api/whoami', (req, res) => {
  res.json({ username: req.session.username || null });
});

// User Registration
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || username.length < 3 || password.length < 6)
    return res.status(400).json({ success: false, error: 'Username must be at least 3 chars and password at least 6 chars' });
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, row) => {
    if (row) return res.status(409).json({ success: false, error: 'Username already exists' });
    const hash = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash], function (err2) {
      if (err2) return res.status(500).json({ success: false, error: 'Registration failed' });
      req.session.username = username;
      res.json({ success: true });
    });
  });
});

// User Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    req.session.username = username;
    res.json({ success: true });
  });
});

// User Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// Friend Request System
app.post('/api/contacts/request', requireAuth, (req, res) => {
  const fromUser = req.session.username;
  const toUser = req.body.username;
  if (!toUser || fromUser === toUser) return res.status(400).json({ success: false, error: 'Invalid username' });
  db.get('SELECT * FROM friend_requests WHERE from_user=? AND to_user=? AND status=?', [fromUser, toUser, 'pending'], (err, row) => {
    if (row) return res.status(400).json({ success: false, error: 'Request already sent' });
    db.run('INSERT INTO friend_requests (from_user, to_user, status) VALUES (?, ?, ?)', [fromUser, toUser, 'pending'], function (err2) {
      if (err2) return res.status(500).json({ success: false, error: 'Failed to send friend request' });
      res.json({ success: true });
    });
  });
});

app.post('/api/contacts/request/:requestId', requireAuth, (req, res) => {
  const user = req.session.username;
  const requestId = req.params.requestId;
  const { action } = req.body;
  if (!['accept', 'reject'].includes(action)) return res.status(400).json({ success: false, error: 'Invalid action' });
  db.get('SELECT * FROM friend_requests WHERE id=? AND to_user=?', [requestId, user], (err, row) => {
    if (!row) return res.status(404).json({ success: false, error: 'Request not found' });
    db.run('UPDATE friend_requests SET status=? WHERE id=?', [action === 'accept' ? 'accepted' : 'rejected', requestId], (err2) => {
      if (action === 'accept') {
        // Add each other as contacts
        db.run('INSERT OR IGNORE INTO contacts (user, contact) VALUES (?, ?)', [user, row.from_user]);
        db.run('INSERT OR IGNORE INTO contacts (user, contact) VALUES (?, ?)', [row.from_user, user]);
      }
      res.json({ success: true });
    });
  });
});

// Get Contacts, Groups, and Requests
app.get('/api/contacts', requireAuth, (req, res) => {
  const username = req.session.username;
  db.all('SELECT contact FROM contacts WHERE user=?', [username], (err, contactsRows) => {
    db.all('SELECT * FROM friend_requests WHERE to_user=? AND status="pending"', [username], (err2, reqRows) => {
      db.all('SELECT id,name FROM groups WHERE owner=? OR id IN (SELECT group_id FROM group_members WHERE username=?)', [username, username], (err3, groupRows) => {
        res.json({
          contacts: contactsRows.map(r => r.contact),
          groups: groupRows,
          requests: reqRows.map(r => ({ from: r.from_user, id: r.id }))
        });
      });
    });
  });
});

// Send Message (Contact) WITH FILE SUPPORT
app.post('/api/conversations/:contact', requireAuth, upload.single('file'), (req, res) => {
  const from = req.session.username;
  const to = req.params.contact;
  const { message } = req.body;
  let fileUrl = null;
  if (req.file) fileUrl = '/uploads/' + req.file.filename;
  if (!message && !fileUrl) return res.status(400).json({ error: "Message or file required" });
  // Chat id is sorted usernames
  const chatId = [from, to].sort().join('__');
  db.run('INSERT INTO messages (chat_type, chat_id, sender, message, file_url) VALUES (?, ?, ?, ?, ?)', ['contact', chatId, from, message, fileUrl], function (err) {
    if (err) return res.status(500).json({ error: "Failed to send message" });
    res.json({ success: true });
  });
});

// Get Messages (Contact)
app.get('/api/conversations/:contact', requireAuth, (req, res) => {
  const from = req.session.username;
  const to = req.params.contact;
  const chatId = [from, to].sort().join('__');
  db.all('SELECT * FROM messages WHERE chat_type="contact" AND chat_id=? ORDER BY timestamp', [chatId], (err, rows) => {
    res.json(rows || []);
  });
});

// Create Group
app.post('/api/groups', requireAuth, (req, res) => {
  const { name, members } = req.body;
  const username = req.session.username;
  if (!name || !Array.isArray(members) || members.length < 1) {
    return res.status(400).json({ success: false, error: "Name and at least one member required" });
  }
  db.run('INSERT INTO groups (name, owner) VALUES (?, ?)', [name, username], function (err) {
    if (err) return res.status(500).json({ success: false, error: 'Failed to create group' });
    const groupId = this.lastID;
    const allMembers = Array.from(new Set([username, ...members]));
    allMembers.forEach(m => {
      db.run('INSERT INTO group_members (group_id, username) VALUES (?, ?)', [groupId, m]);
    });
    res.json({ success: true, groupId });
  });
});

// Get Group Messages
app.get('/api/groups/:groupId/messages', requireAuth, (req, res) => {
  const username = req.session.username;
  const groupId = req.params.groupId;
  db.get('SELECT * FROM group_members WHERE group_id=? AND username=?', [groupId, username], (err, row) => {
    if (!row) return res.status(403).json({ success: false, error: "Not a group member" });
    db.all('SELECT * FROM messages WHERE chat_type="group" AND chat_id=? ORDER BY timestamp', [groupId], (err2, rows) => {
      res.json(rows || []);
    });
  });
});

// Send Group Message WITH FILE SUPPORT
app.post('/api/groups/:groupId/messages', requireAuth, upload.single('file'), (req, res) => {
  const username = req.session.username;
  const groupId = req.params.groupId;
  const { message } = req.body;
  let fileUrl = null;
  if (req.file) fileUrl = '/uploads/' + req.file.filename;
  if (!message && !fileUrl) return res.status(400).json({ error: "Message or file required" });
  db.get('SELECT * FROM group_members WHERE group_id=? AND username=?', [groupId, username], (err, row) => {
    if (!row) return res.status(403).json({ success: false, error: "Not a group member" });
    db.run('INSERT INTO messages (chat_type, chat_id, sender, message, file_url) VALUES (?, ?, ?, ?, ?)', ['group', groupId, username, message, fileUrl], function (err2) {
      if (err2) return res.status(500).json({ error: "Failed to send message" });
      res.json({ success: true });
    });
  });
});

// --- EDIT/DELETE MESSAGE ---
app.put('/api/messages/:chatType/:chatId/:msgIdx', requireAuth, (req, res) => {
  const { chatType, chatId, msgIdx } = req.params;
  const { message } = req.body;
  const username = req.session.username;
  db.all('SELECT * FROM messages WHERE chat_type=? AND chat_id=? ORDER BY timestamp', [chatType, chatId], (err, rows) => {
    const msg = rows && rows[msgIdx];
    if (!msg || msg.sender !== username) return res.status(403).json({ error: "Can't edit" });
    db.run('UPDATE messages SET message=? WHERE id=?', [message, msg.id], err2 => {
      res.json({ success: true });
    });
  });
});

app.delete('/api/messages/:chatType/:chatId/:msgIdx', requireAuth, (req, res) => {
  const { chatType, chatId, msgIdx } = req.params;
  const username = req.session.username;
  db.all('SELECT * FROM messages WHERE chat_type=? AND chat_id=? ORDER BY timestamp', [chatType, chatId], (err, rows) => {
    const msg = rows && rows[msgIdx];
    if (!msg || msg.sender !== username) return res.status(403).json({ error: "Can't delete" });
    db.run('DELETE FROM messages WHERE id=?', [msg.id], err2 => {
      res.json({ success: true });
    });
  });
});

// Typing Indicator (Contact)
app.post('/api/typing/:contact', requireAuth, (req, res) => {
  const from = req.session.username;
  const to = req.params.contact;
  const { typing } = req.body;
  const chatId = [from, to].sort().join('__');
  db.run(
    `INSERT INTO typing_status (chat_type, chat_id, username, typing)
     VALUES ('contact', ?, ?, ?)
     ON CONFLICT(chat_type, chat_id, username) DO UPDATE SET typing = excluded.typing`,
     [chatId, from, typing ? 1 : 0],
     err => res.json({ success: true })
  );
});
app.get('/api/typing/:contact', requireAuth, (req, res) => {
  const from = req.session.username;
  const to = req.params.contact;
  const chatId = [from, to].sort().join('__');
  db.get(
    `SELECT username FROM typing_status WHERE chat_type='contact' AND chat_id=? AND username!=? AND typing=1`,
    [chatId, from],
    (err, row) => {
      if (row) res.json({ typing: true, user: row.username });
      else res.json({ typing: false });
    }
  );
});

// Typing Indicator (Group)
app.post('/api/groups/:groupId/typing', requireAuth, (req, res) => {
  const username = req.session.username;
  const groupId = req.params.groupId;
  const { typing } = req.body;
  db.run(
    `INSERT INTO typing_status (chat_type, chat_id, username, typing)
     VALUES ('group', ?, ?, ?)
     ON CONFLICT(chat_type, chat_id, username) DO UPDATE SET typing = excluded.typing`,
     [groupId, username, typing ? 1 : 0],
     err => res.json({ success: true })
  );
});
app.get('/api/groups/:groupId/typing', requireAuth, (req, res) => {
  const username = req.session.username;
  const groupId = req.params.groupId;
  db.get(
    `SELECT username FROM typing_status WHERE chat_type='group' AND chat_id=? AND username!=? AND typing=1`,
    [groupId, username],
    (err, row) => {
      if (row) res.json({ typing: true, user: row.username });
      else res.json({ typing: false });
    }
  );
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});