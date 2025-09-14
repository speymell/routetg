require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(helmet());
app.use(cors());
app.use(express.json());

// База данных SQLite
const db = new sqlite3.Database('app.db'); // Файловая база данных
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, 
    username TEXT, 
    first_name TEXT,
    last_name TEXT,
    avatar TEXT, 
    status TEXT DEFAULT 'online',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    name TEXT, 
    description TEXT,
    owner_id INTEGER,
    invite_code TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users (id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS server_members (
    server_id INTEGER,
    user_id INTEGER,
    role TEXT DEFAULT 'member',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (server_id, user_id),
    FOREIGN KEY (server_id) REFERENCES servers (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    server_id INTEGER, 
    name TEXT, 
    type TEXT DEFAULT 'voice',
    owner_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers (id),
    FOREIGN KEY (owner_id) REFERENCES users (id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS channel_members (
    channel_id INTEGER, 
    user_id INTEGER,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (channel_id, user_id),
    FOREIGN KEY (channel_id) REFERENCES channels (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);
});

// Функция для проверки подписи Telegram
function verifyTelegramWebAppData(initData, botToken) {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');
  
  const dataCheckString = Array.from(urlParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  
  return calculatedHash === hash;
}

// Middleware для аутентификации
function authenticateTelegram(req, res, next) {
  const { initData } = req.body;
  
  // Для тестирования без Telegram
  if (!initData) {
    console.log('No initData provided, using test user');
    const testUserId = Math.floor(Math.random() * 10000) + 1000;
    req.user = { 
      id: testUserId, 
      username: 'TestUser', 
      first_name: 'Test', 
      last_name: 'User',
      photo_url: ''
    };
    return next();
  }
  
  // В продакшене проверяем подпись
  const botToken = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
  if (botToken && botToken !== 'YOUR_BOT_TOKEN' && !verifyTelegramWebAppData(initData, botToken)) {
    console.log('Invalid signature, using test user');
    const testUserId = Math.floor(Math.random() * 10000) + 1000;
    req.user = { 
      id: testUserId, 
      username: 'TestUser', 
      first_name: 'Test', 
      last_name: 'User',
      photo_url: ''
    };
    return next();
  }
  
  // Парсим данные пользователя
  const urlParams = new URLSearchParams(initData);
  const userParam = urlParams.get('user');
  if (userParam) {
    req.user = JSON.parse(userParam);
    console.log('User authenticated from Telegram:', req.user);
  } else {
    console.log('No user param in initData, using test user');
    const testUserId = Math.floor(Math.random() * 10000) + 1000;
    req.user = { 
      id: testUserId, 
      username: 'TestUser', 
      first_name: 'Test', 
      last_name: 'User',
      photo_url: ''
    };
  }
  
  next();
}

// API: Получить/создать профиль пользователя
app.post('/api/profile', authenticateTelegram, (req, res) => {
  const user = req.user;
  db.get('SELECT * FROM users WHERE id = ?', [user.id], (err, row) => {
    if (!row) {
      // Создать нового пользователя
      db.run('INSERT INTO users (id, username, first_name, last_name, avatar) VALUES (?, ?, ?, ?, ?)', 
        [user.id, user.username || '', user.first_name || '', user.last_name || '', user.photo_url || ''], 
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ 
            id: user.id, 
            username: user.username || `${user.first_name} ${user.last_name}`.trim(),
            first_name: user.first_name,
            last_name: user.last_name,
            avatar: user.photo_url || '',
            status: 'online'
          });
        });
    } else {
      // Обновить данные существующего пользователя
      db.run('UPDATE users SET username = ?, first_name = ?, last_name = ?, avatar = ? WHERE id = ?',
        [user.username || row.username, user.first_name || row.first_name, user.last_name || row.last_name, user.photo_url || row.avatar, user.id],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ 
            id: user.id, 
            username: user.username || row.username,
            first_name: user.first_name || row.first_name,
            last_name: user.last_name || row.last_name,
            avatar: user.photo_url || row.avatar,
            status: row.status
          });
        });
    }
  });
});

// API: Обновить статус пользователя
app.post('/api/profile/status', authenticateTelegram, (req, res) => {
  const { status } = req.body;
  const user = req.user;
  db.run('UPDATE users SET status = ? WHERE id = ?', [status, user.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, status });
  });
});

// API: Получить серверы пользователя
app.post('/api/servers', authenticateTelegram, (req, res) => {
  const user = req.user;
  db.all(`
    SELECT s.*, sm.role 
    FROM servers s 
    JOIN server_members sm ON s.id = sm.server_id 
    WHERE sm.user_id = ? 
    ORDER BY s.created_at DESC
  `, [user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// API: Создать сервер
app.post('/api/server', authenticateTelegram, (req, res) => {
  const { name, description } = req.body;
  const user = req.user;
  const inviteCode = crypto.randomBytes(8).toString('hex');
  
  console.log(`🏗️ Creating server: ${name} by user ${user.id} (${user.username})`);
  
  db.run('INSERT INTO servers (name, description, owner_id, invite_code) VALUES (?, ?, ?, ?)', 
    [name, description || '', user.id, inviteCode], 
    function(err) {
      if (err) {
        console.error('❌ Error creating server:', err.message);
        return res.status(500).json({ error: err.message });
      }
      const serverId = this.lastID;
      console.log(`✅ Server created with ID: ${serverId}`);
      
      // Добавить владельца как участника сервера
      db.run('INSERT INTO server_members (server_id, user_id, role) VALUES (?, ?, ?)', 
        [serverId, user.id, 'owner'], (err) => {
          if (err) {
            console.error('❌ Error adding server member:', err.message);
            return res.status(500).json({ error: err.message });
          }
          console.log(`✅ Server member added: ${user.id} as owner`);
          
          // Создать общий канал
          db.run('INSERT INTO channels (name, server_id, owner_id, type) VALUES (?, ?, ?, ?)', 
            ['Общий', serverId, user.id, 'voice'], (err) => {
              if (err) {
                console.error('❌ Error creating channel:', err.message);
                return res.status(500).json({ error: err.message });
              }
              console.log(`✅ Default channel created for server ${serverId}`);
              res.json({ 
                id: serverId, 
                name, 
                description: description || '',
                invite_code: inviteCode,
                role: 'owner'
              });
            });
        });
    });
});

// API: Присоединиться к серверу по invite коду
app.post('/api/server/join', authenticateTelegram, (req, res) => {
  const { inviteCode } = req.body;
  const user = req.user;
  
  db.get('SELECT * FROM servers WHERE invite_code = ?', [inviteCode], (err, server) => {
    if (err || !server) return res.status(404).json({ error: 'Server not found' });
    
    db.run('INSERT OR IGNORE INTO server_members (server_id, user_id, role) VALUES (?, ?, ?)', 
      [server.id, user.id, 'member'], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, server });
      });
  });
});

// API: Получить каналы сервера
app.post('/api/server/:serverId/channels', authenticateTelegram, (req, res) => {
  const { serverId } = req.params;
  const user = req.user;
  
  // Проверить, что пользователь является участником сервера
  db.get('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?', 
    [serverId, user.id], (err, membership) => {
      if (err || !membership) return res.status(403).json({ error: 'Access denied' });
      
      db.all('SELECT * FROM channels WHERE server_id = ? ORDER BY created_at ASC', 
        [serverId], (err, channels) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json(channels);
        });
    });
});

// API: Создать канал
app.post('/api/server/:serverId/channel', authenticateTelegram, (req, res) => {
  const { serverId } = req.params;
  const { name, type } = req.body;
  const user = req.user;
  
  // Проверить права (только владелец или админ)
  db.get('SELECT role FROM server_members WHERE server_id = ? AND user_id = ?', 
    [serverId, user.id], (err, membership) => {
      if (err || !membership || !['owner', 'admin'].includes(membership.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      
      db.run('INSERT INTO channels (name, server_id, owner_id, type) VALUES (?, ?, ?, ?)', 
        [name, serverId, user.id, type || 'voice'], function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ id: this.lastID, name, type: type || 'voice' });
        });
    });
});

// API: Присоединиться к каналу
app.post('/api/channel/:channelId/join', authenticateTelegram, (req, res) => {
  const { channelId } = req.params;
  const user = req.user;
  
  // Проверить, что пользователь имеет доступ к серверу канала
  db.get(`
    SELECT c.*, s.id as server_id 
    FROM channels c 
    JOIN servers s ON c.server_id = s.id 
    JOIN server_members sm ON s.id = sm.server_id 
    WHERE c.id = ? AND sm.user_id = ?
  `, [channelId, user.id], (err, channel) => {
    if (err || !channel) return res.status(403).json({ error: 'Access denied' });
    
    db.run('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)', 
      [channelId, user.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, channel });
      });
  });
});

// API: Получить участников канала
app.post('/api/channel/:channelId/members', authenticateTelegram, (req, res) => {
  const { channelId } = req.params;
  const user = req.user;
  
  db.all(`
    SELECT u.id, u.username, u.first_name, u.last_name, u.avatar, u.status, cm.joined_at
    FROM channel_members cm
    JOIN users u ON cm.user_id = u.id
    JOIN channels c ON cm.channel_id = c.id
    JOIN server_members sm ON c.server_id = sm.server_id AND u.id = sm.user_id
    WHERE cm.channel_id = ? AND sm.user_id = ?
    ORDER BY cm.joined_at ASC
  `, [channelId, user.id], (err, members) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(members);
  });
});

// API: Получить информацию о пользователе по ID
app.post('/api/user/:userId', authenticateTelegram, (req, res) => {
  const { userId } = req.params;
  const user = req.user;
  
  db.get('SELECT id, username, first_name, last_name, avatar, status FROM users WHERE id = ?', 
    [userId], (err, userData) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!userData) return res.status(404).json({ error: 'User not found' });
      res.json(userData);
    });
});

// Статические файлы
app.use(express.static(path.join(__dirname, '../frontend')));

// Signaling для WebRTC (голосовой чат)
const connectedUsers = new Map(); // userId -> socketId
const channelUsers = new Map(); // channelId -> Set of userIds

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Аутентификация пользователя
  socket.on('authenticate', (data) => {
    const { userId, username } = data;
    connectedUsers.set(userId, socket.id);
    socket.userId = userId;
    socket.username = username;
    console.log(`User ${username} (${userId}) authenticated`);
  });

  // Присоединиться к комнате (каналу)
  socket.on('join-channel', (data) => {
    const { channelId, userId, username } = data;
    console.log(`🔵 User ${username} (${userId}) joining channel ${channelId}`);
    
    socket.join(channelId);
    
    if (!channelUsers.has(channelId)) {
      channelUsers.set(channelId, new Set());
    }
    channelUsers.get(channelId).add(userId);
    
    // Уведомить других участников
    console.log(`🔵 Notifying other users in channel ${channelId} about new user ${userId}`);
    socket.to(channelId).emit('user-joined', { 
      userId, 
      username,
      socketId: socket.id 
    });
    
    // Отправить список текущих участников новому пользователю
    const currentUsers = Array.from(channelUsers.get(channelId))
      .filter(id => id !== userId)
      .map(id => ({ 
        userId: id, 
        socketId: connectedUsers.get(id),
        username: connectedUsers.get(id) ? 'User' : 'Unknown' // Временно, будет заменено на реальное имя
      }));
    
    console.log(`🔵 Sending channel users to ${username}:`, currentUsers);
    socket.emit('channel-users', currentUsers);
    
    console.log(`🔵 User ${username} (${userId}) joined channel ${channelId}`);
    console.log(`🔵 Current users in channel ${channelId}:`, Array.from(channelUsers.get(channelId)));
  });

  // Покинуть канал
  socket.on('leave-channel', (data) => {
    const { channelId, userId } = data;
    socket.leave(channelId);
    
    if (channelUsers.has(channelId)) {
      channelUsers.get(channelId).delete(userId);
    }
    
    socket.to(channelId).emit('user-left', { userId, socketId: socket.id });
    console.log(`User ${userId} left channel ${channelId}`);
  });

  // WebRTC signaling
  socket.on('offer', (data) => {
    const { target, offer, from } = data;
    const targetSocket = connectedUsers.get(target);
    if (targetSocket) {
      io.to(targetSocket).emit('offer', { 
        offer, 
        from: socket.userId,
        fromSocket: socket.id 
      });
    }
  });

  socket.on('answer', (data) => {
    const { target, answer, from } = data;
    const targetSocket = connectedUsers.get(target);
    if (targetSocket) {
      io.to(targetSocket).emit('answer', { 
        answer, 
        from: socket.userId,
        fromSocket: socket.id 
      });
    }
  });

  socket.on('ice-candidate', (data) => {
    const { target, candidate, from } = data;
    const targetSocket = connectedUsers.get(target);
    if (targetSocket) {
      io.to(targetSocket).emit('ice-candidate', { 
        candidate, 
        from: socket.userId,
        fromSocket: socket.id 
      });
    }
  });

  // Управление микрофоном
  socket.on('mute-toggle', (data) => {
    const { channelId, isMuted } = data;
    socket.to(channelId).emit('user-mute-changed', {
      userId: socket.userId,
      isMuted
    });
  });

  socket.on('disconnect', () => {
    const userId = socket.userId;
    if (userId) {
      connectedUsers.delete(userId);
      
      // Удалить из всех каналов
      for (const [channelId, users] of channelUsers.entries()) {
        if (users.has(userId)) {
          users.delete(userId);
          socket.to(channelId).emit('user-left', { 
            userId, 
            socketId: socket.id 
          });
        }
      }
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;

// Для Vercel
if (process.env.NODE_ENV === 'production') {
  module.exports = app;
} else {
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}