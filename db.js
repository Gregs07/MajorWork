const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('data.db');

// Schema initialization
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS public_keys (
    username TEXT PRIMARY KEY,
    public_key TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT NOT NULL,
    contact TEXT NOT NULL,
    UNIQUE(user, contact)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS friend_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user TEXT NOT NULL,
    to_user TEXT NOT NULL,
    status TEXT NOT NULL -- 'pending', 'accepted', 'rejected'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    owner TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER,
    username TEXT,
    PRIMARY KEY (group_id, username)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_type TEXT NOT NULL, -- 'contact' or 'group'
    chat_id TEXT NOT NULL,   -- username for contact, group id for group
    sender TEXT NOT NULL,
    message TEXT,
    file_url TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS typing_status (
    chat_type TEXT NOT NULL, -- 'contact' or 'group'
    chat_id TEXT NOT NULL,
    username TEXT NOT NULL,
    typing INTEGER NOT NULL, -- 0 or 1
    PRIMARY KEY (chat_type, chat_id, username)
  )`);
});

module.exports = db;