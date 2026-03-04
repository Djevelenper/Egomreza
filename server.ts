import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(":memory:"); // Using in-memory for easy demo/Vercel compatibility

// --- Database Schema ---
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firstName TEXT,
    lastName TEXT,
    avatar TEXT,
    bio TEXT DEFAULT '',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE statuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    content TEXT,
    imageUrl TEXT DEFAULT NULL,
    repostOfId INTEGER DEFAULT NULL,
    quoteText TEXT DEFAULT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(repostOfId) REFERENCES statuses(id)
  );

  CREATE TABLE interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    statusId INTEGER,
    type TEXT, -- 'like', 'dislike', 'repost'
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(statusId) REFERENCES statuses(id)
  );

  CREATE TABLE comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    statusId INTEGER,
    content TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(statusId) REFERENCES statuses(id)
  );

  CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    fromUserId INTEGER,
    type TEXT, -- 'like', 'repost', 'follow', 'comment'
    statusId INTEGER DEFAULT NULL,
    isRead INTEGER DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(fromUserId) REFERENCES users(id)
  );

  CREATE TABLE follows (
    followerId INTEGER,
    followingId INTEGER,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (followerId, followingId),
    FOREIGN KEY(followerId) REFERENCES users(id),
    FOREIGN KEY(followingId) REFERENCES users(id)
  );
`);

// --- No bots, just an empty state or minimal test user ---
const seed = () => {
  // We'll let users register themselves now.
};

seed();

const app = express();
app.use(express.json());

// Simple session management via header for demo purposes
// In a real app, use express-session or JWT
const getUserId = (req: any) => {
  const id = req.headers["x-user-id"];
  if (!id) return null;
  const parsed = parseInt(id);
  return isNaN(parsed) ? null : parsed;
};

// --- API Endpoints ---

app.post("/api/register", (req, res) => {
  const { firstName, lastName, avatar, bio } = req.body;
  if (!firstName || !lastName) return res.status(400).json({ error: "Name required" });
  const result = db.prepare("INSERT INTO users (firstName, lastName, avatar, bio) VALUES (?, ?, ?, ?)").run(firstName, lastName, avatar, bio || '');
  res.json({ id: result.lastInsertRowid });
});

app.get("/api/me", (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not logged in" });
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

app.post("/api/statuses", (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not logged in" });
  const { content, repostOfId, quoteText, imageUrl } = req.body;
  const result = db.prepare("INSERT INTO statuses (userId, content, repostOfId, quoteText, imageUrl) VALUES (?, ?, ?, ?, ?)").run(userId, content, repostOfId, quoteText, imageUrl);
  res.json({ id: result.lastInsertRowid });
});

app.get("/api/feed/following", (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not logged in" });

  // Following Feed Algorithm:
  // 1. Statuses from people you follow
  // 2. Statuses you liked (to see them again/history)
  // 3. Statuses liked by people you like
  
  const statuses = db.prepare(`
    SELECT DISTINCT s.*, u.firstName, u.lastName, u.avatar,
    (SELECT COUNT(*) FROM interactions WHERE statusId = s.id AND type = 'like') as likes,
    (SELECT COUNT(*) FROM interactions WHERE statusId = s.id AND type = 'dislike') as dislikes,
    (SELECT COUNT(*) FROM interactions WHERE statusId = s.id AND type = 'repost') as repostsCount,
    (SELECT type FROM interactions WHERE statusId = s.id AND userId = ?) as myInteraction,
    orig_u.firstName as origFirstName, orig_u.lastName as origLastName, orig_s.content as origContent, orig_s.imageUrl as origImageUrl
    FROM statuses s
    JOIN users u ON s.userId = u.id
    LEFT JOIN statuses orig_s ON s.repostOfId = orig_s.id
    LEFT JOIN users orig_u ON orig_s.userId = orig_u.id
    WHERE s.createdAt > datetime('now', '-3 minutes')
    AND (
      s.userId IN (SELECT followingId FROM follows WHERE followerId = ?)
      OR s.id IN (SELECT statusId FROM interactions WHERE userId = ? AND type = 'like')
      OR s.id IN (
        SELECT i.statusId 
        FROM interactions i 
        WHERE i.type = 'like' 
        AND i.userId IN (
          SELECT i2.userId 
          FROM interactions i2 
          WHERE i2.statusId IN (SELECT statusId FROM interactions WHERE userId = ? AND type = 'like')
        )
      )
    )
    ORDER BY s.createdAt DESC
  `).all(userId, userId, userId, userId);
  res.json(statuses);
});

app.get("/api/feed/global", (req, res) => {
  const userId = getUserId(req);
  const statuses = db.prepare(`
    SELECT s.*, u.firstName, u.lastName, u.avatar,
    (SELECT COUNT(*) FROM interactions WHERE statusId = s.id AND type = 'like') as likes,
    (SELECT COUNT(*) FROM interactions WHERE statusId = s.id AND type = 'dislike') as dislikes,
    (SELECT COUNT(*) FROM interactions WHERE statusId = s.id AND type = 'repost') as repostsCount,
    (SELECT type FROM interactions WHERE statusId = s.id AND userId = ?) as myInteraction,
    orig_u.firstName as origFirstName, orig_u.lastName as origLastName, orig_s.content as origContent, orig_s.imageUrl as origImageUrl
    FROM statuses s
    JOIN users u ON s.userId = u.id
    LEFT JOIN statuses orig_s ON s.repostOfId = orig_s.id
    LEFT JOIN users orig_u ON orig_s.userId = orig_u.id
    WHERE s.createdAt > datetime('now', '-3 minutes')
    ORDER BY s.createdAt DESC
  `).all(userId);
  res.json(statuses);
});

app.get("/api/feed/suggested", (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not logged in" });

  // Suggested Feed Algorithm (Provocation):
  // 1. Statuses from people you disliked
  // 2. Statuses from people who liked what you disliked
  
  const statuses = db.prepare(`
    SELECT DISTINCT s.*, u.firstName, u.lastName, u.avatar,
    (SELECT COUNT(*) FROM interactions WHERE statusId = s.id AND type = 'like') as likes,
    (SELECT COUNT(*) FROM interactions WHERE statusId = s.id AND type = 'dislike') as dislikes,
    (SELECT COUNT(*) FROM interactions WHERE statusId = s.id AND type = 'repost') as repostsCount,
    (SELECT type FROM interactions WHERE statusId = s.id AND userId = ?) as myInteraction,
    orig_u.firstName as origFirstName, orig_u.lastName as origLastName, orig_s.content as origContent, orig_s.imageUrl as origImageUrl
    FROM statuses s
    JOIN users u ON s.userId = u.id
    LEFT JOIN statuses orig_s ON s.repostOfId = orig_s.id
    LEFT JOIN users orig_u ON orig_s.userId = orig_u.id
    WHERE s.createdAt > datetime('now', '-3 minutes')
    AND s.userId != ?
    AND (
      s.userId IN (
        SELECT s2.userId 
        FROM statuses s2 
        JOIN interactions i ON s2.id = i.statusId 
        WHERE i.userId = ? AND i.type = 'dislike'
      )
      OR s.userId IN (
        SELECT i.userId 
        FROM interactions i 
        WHERE i.type = 'like' 
        AND i.statusId IN (
          SELECT statusId 
          FROM interactions 
          WHERE userId = ? AND type = 'dislike'
        )
      )
    )
    ORDER BY s.createdAt DESC
  `).all(userId, userId, userId, userId);

  // If suggested is empty, show some random ones to get things started
  if (statuses.length === 0) {
    const random = db.prepare(`
      SELECT s.*, u.firstName, u.lastName, u.avatar,
      (SELECT COUNT(*) FROM interactions WHERE statusId = s.id AND type = 'like') as likes,
      (SELECT COUNT(*) FROM interactions WHERE statusId = s.id AND type = 'dislike') as dislikes,
      (SELECT COUNT(*) FROM interactions WHERE statusId = s.id AND type = 'repost') as repostsCount,
      (SELECT type FROM interactions WHERE statusId = s.id AND userId = ?) as myInteraction,
      orig_u.firstName as origFirstName, orig_u.lastName as origLastName, orig_s.content as origContent, orig_s.imageUrl as origImageUrl
      FROM statuses s
      JOIN users u ON s.userId = u.id
      LEFT JOIN statuses orig_s ON s.repostOfId = orig_s.id
      LEFT JOIN users orig_u ON orig_s.userId = orig_u.id
      WHERE s.createdAt > datetime('now', '-3 minutes')
      AND s.userId != ?
      ORDER BY RANDOM() LIMIT 20
    `).all(userId, userId);
    return res.json(random);
  }

  res.json(statuses);
});

app.post("/api/interactions", (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not logged in" });
  const { statusId, type } = req.body;
  
  const existing = db.prepare("SELECT * FROM interactions WHERE userId = ? AND statusId = ?").get(userId, statusId);
  
  if (existing) {
    db.prepare("DELETE FROM interactions WHERE id = ?").run(existing.id);
    if (existing.type !== type) {
      db.prepare("INSERT INTO interactions (userId, statusId, type) VALUES (?, ?, ?)").run(userId, statusId, type);
    }
  } else {
    db.prepare("INSERT INTO interactions (userId, statusId, type) VALUES (?, ?, ?)").run(userId, statusId, type);
    
    // Notify the post owner
    const status = db.prepare("SELECT userId FROM statuses WHERE id = ?").get(statusId);
    if (status && status.userId !== userId) {
      db.prepare("INSERT INTO notifications (userId, fromUserId, type, statusId) VALUES (?, ?, ?, ?)").run(status.userId, userId, type, statusId);
    }
  }
  
  res.json({ success: true });
});

app.post("/api/comments", (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not logged in" });
  const { statusId, content } = req.body;
  
  // Check if user has interacted
  const interaction = db.prepare("SELECT * FROM interactions WHERE userId = ? AND statusId = ?").get(userId, statusId);
  
  if (!interaction) {
    return res.status(403).json({ error: "You must like or dislike before commenting." });
  }
  
  db.prepare("INSERT INTO comments (userId, statusId, content) VALUES (?, ?, ?)").run(userId, statusId, content);
  
  // Notify the post owner
  const status = db.prepare("SELECT userId FROM statuses WHERE id = ?").get(statusId);
  if (status && status.userId !== userId) {
    db.prepare("INSERT INTO notifications (userId, fromUserId, type, statusId) VALUES (?, ?, ?, ?)").run(status.userId, userId, 'comment', statusId);
  }
  
  res.json({ success: true });
});

app.post("/api/follow", (req, res) => {
  const followerId = getUserId(req);
  if (!followerId) return res.status(401).json({ error: "Not logged in" });
  const { userId: followingId } = req.body;
  try {
    db.prepare("INSERT INTO follows (followerId, followingId) VALUES (?, ?)").run(followerId, followingId);
    // Notify
    if (followerId !== followingId) {
      db.prepare("INSERT INTO notifications (userId, fromUserId, type) VALUES (?, ?, ?)").run(followingId, followerId, 'follow');
    }
  } catch (e) {
    db.prepare("DELETE FROM follows WHERE followerId = ? AND followingId = ?").run(followerId, followingId);
  }
  res.json({ success: true });
});

app.get("/api/comments/:statusId", (req, res) => {
  const comments = db.prepare(`
    SELECT c.*, u.firstName, u.lastName, u.avatar
    FROM comments c
    JOIN users u ON c.userId = u.id
    WHERE c.statusId = ?
    ORDER BY c.createdAt ASC
  `).all(req.params.statusId);
  res.json(comments);
});

app.get("/api/users/suggested", (req, res) => {
  const userId = getUserId(req);
  const users = db.prepare(`
    SELECT id, firstName, lastName, avatar, bio
    FROM users
    WHERE id != ?
    AND id NOT IN (SELECT followingId FROM follows WHERE followerId = ?)
    ORDER BY RANDOM()
    LIMIT 3
  `).all(userId, userId);
  res.json(users);
});

app.get("/api/users/:id", (req, res) => {
  const user = db.prepare(`
    SELECT u.*, 
    (SELECT COUNT(*) FROM follows WHERE followerId = u.id) as followingCount,
    (SELECT COUNT(*) FROM follows WHERE followingId = u.id) as followersCount
    FROM users u WHERE u.id = ?
  `).get(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

app.get("/api/users/:id/statuses", (req, res) => {
  const userId = getUserId(req);
  const statuses = db.prepare(`
    SELECT s.*, u.firstName, u.lastName, u.avatar,
    (SELECT COUNT(*) FROM interactions WHERE statusId = s.id AND type = 'like') as likes,
    (SELECT COUNT(*) FROM interactions WHERE statusId = s.id AND type = 'dislike') as dislikes,
    (SELECT COUNT(*) FROM interactions WHERE statusId = s.id AND type = 'repost') as repostsCount,
    (SELECT type FROM interactions WHERE statusId = s.id AND userId = ?) as myInteraction,
    orig_u.firstName as origFirstName, orig_u.lastName as origLastName, orig_s.content as origContent, orig_s.imageUrl as origImageUrl
    FROM statuses s
    JOIN users u ON s.userId = u.id
    LEFT JOIN statuses orig_s ON s.repostOfId = orig_s.id
    LEFT JOIN users orig_u ON orig_s.userId = orig_u.id
    WHERE s.userId = ? AND s.createdAt > datetime('now', '-3 minutes')
    ORDER BY s.createdAt DESC
  `).all(userId, req.params.id);
  res.json(statuses);
});

app.get("/api/notifications", (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not logged in" });
  const notifications = db.prepare(`
    SELECT n.*, u.firstName, u.lastName, u.avatar
    FROM notifications n
    JOIN users u ON n.fromUserId = u.id
    WHERE n.userId = ?
    ORDER BY n.createdAt DESC
    LIMIT 50
  `).all(userId);
  res.json(notifications);
});

app.get("/api/search", (req, res) => {
  const userId = getUserId(req);
  const query = `%${req.query.q}%`;
  const statuses = db.prepare(`
    SELECT s.*, u.firstName, u.lastName, u.avatar,
    (SELECT COUNT(*) FROM interactions WHERE statusId = s.id AND type = 'like') as likes,
    (SELECT COUNT(*) FROM interactions WHERE statusId = s.id AND type = 'dislike') as dislikes,
    (SELECT COUNT(*) FROM interactions WHERE statusId = s.id AND type = 'repost') as repostsCount,
    (SELECT type FROM interactions WHERE statusId = s.id AND userId = ?) as myInteraction,
    orig_u.firstName as origFirstName, orig_u.lastName as origLastName, orig_s.content as origContent, orig_s.imageUrl as origImageUrl
    FROM statuses s
    JOIN users u ON s.userId = u.id
    LEFT JOIN statuses orig_s ON s.repostOfId = orig_s.id
    LEFT JOIN users orig_u ON orig_s.userId = orig_u.id
    WHERE s.content LIKE ? AND s.createdAt > datetime('now', '-3 minutes')
    ORDER BY s.createdAt DESC
  `).all(userId, query);
  res.json(statuses);
});

// --- Vite Integration ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Cleanup expired statuses every minute
  setInterval(() => {
    db.prepare("DELETE FROM statuses WHERE createdAt < datetime('now', '-3 minutes')").run();
    db.prepare("DELETE FROM interactions WHERE statusId NOT IN (SELECT id FROM statuses)").run();
    db.prepare("DELETE FROM comments WHERE statusId NOT IN (SELECT id FROM statuses)").run();
  }, 60000);
}

startServer();
