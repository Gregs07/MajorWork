-- Users table
CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    publickey TEXT
);

-- Contacts table (friendships)
CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    user1 TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    user2 TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    UNIQUE(user1, user2)
);

-- Friend requests table
CREATE TABLE IF NOT EXISTS friend_requests (
    id SERIAL PRIMARY KEY,
    from_user TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    to_user TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    UNIQUE(from_user, to_user)
);

-- Groups table (group chats)
CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    owner TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE
);

-- Group members table
CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    PRIMARY KEY (group_id, username)
);

-- Messages table (for both 1-on-1 and group messages)
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    chat_type TEXT NOT NULL, -- 'contact' or 'group'
    chat_id TEXT NOT NULL,   -- for contacts: user1__user2, for groups: group id as text
    sender TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    message TEXT,
    file TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Session table for connect-pg-simple (used by express-session)
CREATE TABLE IF NOT EXISTS "session" (
    "sid" varchar NOT NULL COLLATE "default",
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid");

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");