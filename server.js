// --- server.js with PostgreSQL (Neon) and connect-pg-simple session store ---

const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('./db'); // <-- Use db.js for database connection

const app = express();

// Session middleware (PostgreSQL-backed)
app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'session'
  }),
  secret: 'your-secret-key', // Replace with a strong secret in production!
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS (production)
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Multer setup for file uploads ---
const upload = multer({ dest: path.join(__dirname, 'uploads') });

// --- Serve static files (frontend) ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Helper: Check authentication ---
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// --- Auth routes ---

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  const hash = await bcrypt.hash(password, 10);
  try {
    await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2)',
      [username, hash]
    );
    req.session.user = username;
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  const result = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  req.session.user = username;
  res.json({ success: true });
});

app.post('/api/logout', requireAuth, (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/whoami', (req, res) => {
  res.json({ username: req.session.user || null });
});

// --- Change Password Route ---
app.post('/api/change-password', requireAuth, async (req, res) => {
  const username = req.session.user;
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  try {
    // Get user from DB
    const result = await pool.query('SELECT password FROM users WHERE username=$1', [username]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Verify current password
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

    // Hash new password
    const hash = await bcrypt.hash(newPassword, 10);

    // Update password in DB
    await pool.query('UPDATE users SET password=$1 WHERE username=$2', [hash, username]);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Public Key Storage ---
app.post('/api/publickey', requireAuth, async (req, res) => {
  const { username, publicKey } = req.body;
  if (!username || !publicKey) return res.status(400).json({ error: 'Missing fields' });
  await pool.query(
    'UPDATE users SET publickey=$1 WHERE username=$2',
    [publicKey, username]
  );
  res.json({ success: true });
});

app.get('/api/publickey/:username', requireAuth, async (req, res) => {
  const { username } = req.params;
  const result = await pool.query('SELECT publickey FROM users WHERE username=$1', [username]);
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json({ publicKey: result.rows[0].publickey });
});

// --- Contacts & Groups ---

app.get('/api/contacts', requireAuth, async (req, res) => {
  const user = req.session.user;
  // Get contacts
  const contactsRes = await pool.query(
    `SELECT CASE WHEN user1=$1 THEN user2 ELSE user1 END AS contact
     FROM contacts WHERE user1=$1 OR user2=$1`, [user]);
  // Get groups
  const groupsRes = await pool.query(
    `SELECT g.id, g.name FROM groups g
     JOIN group_members gm ON gm.group_id=g.id WHERE gm.username=$1`, [user]);
  // Get friend requests
  const requestsRes = await pool.query(
    `SELECT id, from_user FROM friend_requests WHERE to_user=$1`, [user]);
  res.json({
    contacts: contactsRes.rows.map(r => r.contact),
    groups: groupsRes.rows,
    requests: requestsRes.rows.map(r => ({ id: r.id, from: r.from_user }))
  });
});

app.post('/api/contacts/request', requireAuth, async (req, res) => {
  const { username } = req.body;
  const from = req.session.user;
  if (!username || username === from) return res.status(400).json({ error: 'Invalid username' });
  // Check if already friends
  const check = await pool.query(
    'SELECT 1 FROM contacts WHERE (user1=$1 AND user2=$2) OR (user1=$2 AND user2=$1)',
    [from, username]
  );
  if (check.rows.length > 0) return res.status(400).json({ error: 'Already contacts' });
  // Check if user exists
  const userCheck = await pool.query('SELECT 1 FROM users WHERE username=$1', [username]);
  if (userCheck.rows.length === 0) return res.status(404).json({ error: 'User not found' });
  // Insert request
  await pool.query(
    'INSERT INTO friend_requests (from_user, to_user) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [from, username]
  );
  res.json({ success: true });
});

app.post('/api/contacts/request/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  const user = req.session.user;
  const reqRes = await pool.query('SELECT * FROM friend_requests WHERE id=$1', [id]);
  const request = reqRes.rows[0];
  if (!request || request.to_user !== user) return res.status(404).json({ error: 'Request not found' });
  if (action === 'accept') {
    await pool.query('INSERT INTO contacts (user1, user2) VALUES ($1, $2)', [user, request.from_user]);
  }
  await pool.query('DELETE FROM friend_requests WHERE id=$1', [id]);
  res.json({ success: true });
});

// --- Groups ---
app.post('/api/groups', requireAuth, async (req, res) => {
  const { name, members } = req.body;
  const owner = req.session.user;
  if (!name || !Array.isArray(members) || members.length < 1) {
    return res.status(400).json({ error: 'Invalid group data' });
  }
  const groupRes = await pool.query(
    'INSERT INTO groups (name, owner) VALUES ($1, $2) RETURNING id', [name, owner]);
  const groupId = groupRes.rows[0].id;
  // Add owner as member
  await pool.query('INSERT INTO group_members (group_id, username) VALUES ($1, $2)', [groupId, owner]);
  // Add members
  for (const member of members) {
    await pool.query('INSERT INTO group_members (group_id, username) VALUES ($1, $2)', [groupId, member]);
  }
  res.json({ success: true, groupId });
});

// --- Messaging ---

// 1-on-1 conversations
app.get('/api/conversations/:contact', requireAuth, async (req, res) => {
  const user = req.session.user;
  const contact = req.params.contact;
  const chatId = [user, contact].sort().join('__');
  const rows = await pool.query(
    `SELECT sender, message, file, created_at FROM messages
     WHERE chat_type='contact' AND chat_id=$1 ORDER BY created_at ASC`,
    [chatId]
  );
  res.json(rows.rows);
});

app.post('/api/conversations/:contact', requireAuth, upload.single('file'), async (req, res) => {
  const user = req.session.user;
  const contact = req.params.contact;
  const chatId = [user, contact].sort().join('__');
  let { message } = req.body;
  let file = null;
  if (req.file) {
    const filePath = `/uploads/${req.file.filename}`;
    file = filePath;
  }
  await pool.query(
    `INSERT INTO messages (chat_type, chat_id, sender, message, file, created_at)
     VALUES ('contact', $1, $2, $3, $4, NOW())`,
    [chatId, user, message, file]
  );
  res.json({ success: true });
});

// Group conversations
app.get('/api/groups/:groupid/messages', requireAuth, async (req, res) => {
  const groupId = req.params.groupid;
  const rows = await pool.query(
    `SELECT sender, message, file, created_at FROM messages
     WHERE chat_type='group' AND chat_id=$1 ORDER BY created_at ASC`,
    [groupId]
  );
  res.json(rows.rows);
});

app.post('/api/groups/:groupid/messages', requireAuth, upload.single('file'), async (req, res) => {
  const user = req.session.user;
  const groupId = req.params.groupid;
  let { message } = req.body;
  let file = null;
  if (req.file) {
    const filePath = `/uploads/${req.file.filename}`;
    file = filePath;
  }
  await pool.query(
    `INSERT INTO messages (chat_type, chat_id, sender, message, file, created_at)
     VALUES ('group', $1, $2, $3, $4, NOW())`,
    [groupId, user, message, file]
  );
  res.json({ success: true });
});

// --- Edit & Delete Messages ---

app.put('/api/messages/:chatType/:chatId/:msgIdx', requireAuth, async (req, res) => {
  const { chatType, chatId, msgIdx } = req.params;
  const { message } = req.body;
  const user = req.session.user;
  const rows = await pool.query(
    `SELECT id, sender FROM messages WHERE chat_type=$1 AND chat_id=$2 ORDER BY created_at ASC`,
    [chatType, chatId]
  );
  const msg = rows.rows[msgIdx];
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  if (msg.sender !== user) return res.status(403).json({ error: 'Forbidden' });
  await pool.query('UPDATE messages SET message=$1 WHERE id=$2', [message, msg.id]);
  res.json({ success: true });
});

app.delete('/api/messages/:chatType/:chatId/:msgIdx', requireAuth, async (req, res) => {
  const { chatType, chatId, msgIdx } = req.params;
  const user = req.session.user;
  const rows = await pool.query(
    `SELECT id, sender FROM messages WHERE chat_type=$1 AND chat_id=$2 ORDER BY created_at ASC`,
    [chatType, chatId]
  );
  const msg = rows.rows[msgIdx];
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  if (msg.sender !== user) return res.status(403).json({ error: 'Forbidden' });
  await pool.query('DELETE FROM messages WHERE id=$1', [msg.id]);
  res.json({ success: true });
});

// --- File handling (serve uploaded files) ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Typing indicator (demo purpose, not persistent) ---
let typingStatus = {};
app.post('/api/typing/:contact', requireAuth, (req, res) => {
  const { contact } = req.params;
  const user = req.session.user;
  const { typing } = req.body;
  typingStatus[contact] = typing ? user : null;
  res.json({ success: true });
});
app.get('/api/typing/:contact', requireAuth, (req, res) => {
  const { contact } = req.params;
  res.json({ typing: !!typingStatus[contact], user: typingStatus[contact] });
});
app.post('/api/groups/:groupid/typing', requireAuth, (req, res) => {
  const { groupid } = req.params;
  const user = req.session.user;
  const { typing } = req.body;
  typingStatus[groupid] = typing ? user : null;
  res.json({ success: true });
});
app.get('/api/groups/:groupid/typing', requireAuth, (req, res) => {
  const { groupid } = req.params;
  res.json({ typing: !!typingStatus[groupid], user: typingStatus[groupid] });
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server listening on port', PORT);
});