require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Pool } = require('pg');
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

// PostgreSQL подключение
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Проверка подключения к базе данных
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL connection error:', err);
});

// Инициализация таблиц
async function initDatabase() {
  try {
    console.log('🏗️ Initializing database tables...');
    
    // Создание таблицы пользователей
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY, 
        username TEXT, 
        first_name TEXT,
        last_name TEXT,
        avatar TEXT, 
        status TEXT DEFAULT 'online',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Создание таблицы серверов
    await pool.query(`
      CREATE TABLE IF NOT EXISTS servers (
        id SERIAL PRIMARY KEY, 
        name TEXT NOT NULL, 
        description TEXT,
        owner_id BIGINT NOT NULL,
        invite_code TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users (id)
      )
    `);
    
    // Создание таблицы участников серверов
    await pool.query(`
      CREATE TABLE IF NOT EXISTS server_members (
        server_id INTEGER,
        user_id BIGINT,
        role TEXT DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (server_id, user_id),
        FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);
    
    // Создание таблицы каналов
    await pool.query(`
      CREATE TABLE IF NOT EXISTS channels (
        id SERIAL PRIMARY KEY, 
        server_id INTEGER NOT NULL, 
        name TEXT NOT NULL, 
        type TEXT DEFAULT 'voice',
        owner_id BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE,
        FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);
    
    // Создание таблицы участников каналов
    await pool.query(`
      CREATE TABLE IF NOT EXISTS channel_members (
        channel_id INTEGER, 
        user_id BIGINT,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (channel_id, user_id),
        FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);
    
    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
  }
}

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
app.post('/api/profile', authenticateTelegram, async (req, res) => {
  try {
    const user = req.user;
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [user.id]);
    
    if (result.rows.length === 0) {
      // Создать нового пользователя
      await pool.query(
        'INSERT INTO users (id, username, first_name, last_name, avatar) VALUES ($1, $2, $3, $4, $5)', 
        [user.id, user.username || '', user.first_name || '', user.last_name || '', user.photo_url || '']
      );
      res.json({ 
        id: user.id, 
        username: user.username || `${user.first_name} ${user.last_name}`.trim(),
        first_name: user.first_name,
        last_name: user.last_name,
        avatar: user.photo_url || '',
        status: 'online'
      });
    } else {
      // Обновить данные существующего пользователя
      await pool.query(
        'UPDATE users SET username = $1, first_name = $2, last_name = $3, avatar = $4 WHERE id = $5',
        [user.username || result.rows[0].username, user.first_name || result.rows[0].first_name, user.last_name || result.rows[0].last_name, user.photo_url || result.rows[0].avatar, user.id]
      );
      res.json({ 
        id: user.id, 
        username: user.username || result.rows[0].username,
        first_name: user.first_name || result.rows[0].first_name,
        last_name: user.last_name || result.rows[0].last_name,
        avatar: user.photo_url || result.rows[0].avatar,
        status: result.rows[0].status
      });
    }
  } catch (error) {
    console.error('Error in /api/profile:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Получить серверы пользователя
app.post('/api/servers', authenticateTelegram, async (req, res) => {
  try {
    const user = req.user;
    const result = await pool.query(`
      SELECT s.*, sm.role 
      FROM servers s 
      JOIN server_members sm ON s.id = sm.server_id 
      WHERE sm.user_id = $1 
      ORDER BY s.created_at DESC
    `, [user.id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error in /api/servers:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Создать сервер
app.post('/api/server', authenticateTelegram, async (req, res) => {
  try {
    const { name, description } = req.body;
    const user = req.user;
    const inviteCode = crypto.randomBytes(8).toString('hex');
    
    console.log(`🏗️ Creating server: ${name} by user ${user.id} (${user.username})`);
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Создать сервер
      const serverResult = await client.query(
        'INSERT INTO servers (name, description, owner_id, invite_code) VALUES ($1, $2, $3, $4) RETURNING id', 
        [name, description || '', user.id, inviteCode]
      );
      const serverId = serverResult.rows[0].id;
      console.log(`✅ Server created with ID: ${serverId}`);
      
      // Добавить владельца как участника сервера
      await client.query(
        'INSERT INTO server_members (server_id, user_id, role) VALUES ($1, $2, $3)', 
        [serverId, user.id, 'owner']
      );
      console.log(`✅ Server member added: ${user.id} as owner`);
      
      // Создать общий канал
      await client.query(
        'INSERT INTO channels (name, server_id, owner_id, type) VALUES ($1, $2, $3, $4)', 
        ['Общий', serverId, user.id, 'voice']
      );
      console.log(`✅ Default channel created for server ${serverId}`);
      
      await client.query('COMMIT');
      
      res.json({ 
        id: serverId, 
        name, 
        description: description || '',
        invite_code: inviteCode,
        role: 'owner'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error in /api/server:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Присоединиться к серверу по invite коду
app.post('/api/server/join', authenticateTelegram, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    const user = req.user;
    
    const result = await pool.query('SELECT * FROM servers WHERE invite_code = $1', [inviteCode]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Server not found' });
    }
    
    const server = result.rows[0];
    await pool.query(
      'INSERT INTO server_members (server_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (server_id, user_id) DO NOTHING', 
      [server.id, user.id, 'member']
    );
    
    res.json({ success: true, server });
  } catch (error) {
    console.error('Error in /api/server/join:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Получить каналы сервера
app.post('/api/server/:serverId/channels', authenticateTelegram, async (req, res) => {
  try {
    const { serverId } = req.params;
    const user = req.user;
    
    // Проверить, что пользователь является участником сервера
    const membershipResult = await pool.query(
      'SELECT * FROM server_members WHERE server_id = $1 AND user_id = $2', 
      [serverId, user.id]
    );
    
    if (membershipResult.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const result = await pool.query(
      'SELECT * FROM channels WHERE server_id = $1 ORDER BY created_at ASC', 
      [serverId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error in /api/server/:serverId/channels:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Создать канал
app.post('/api/server/:serverId/channel', authenticateTelegram, async (req, res) => {
  try {
    const { serverId } = req.params;
    const { name, type } = req.body;
    const user = req.user;
    
    // Проверить права (только владелец или админ)
    const membershipResult = await pool.query(
      'SELECT role FROM server_members WHERE server_id = $1 AND user_id = $2', 
      [serverId, user.id]
    );
    
    if (membershipResult.rows.length === 0 || !['owner', 'admin'].includes(membershipResult.rows[0].role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    const result = await pool.query(
      'INSERT INTO channels (name, server_id, owner_id, type) VALUES ($1, $2, $3, $4) RETURNING id', 
      [name, serverId, user.id, type || 'voice']
    );
    
    res.json({ id: result.rows[0].id, name, type: type || 'voice' });
  } catch (error) {
    console.error('Error in /api/server/:serverId/channel:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Присоединиться к каналу
app.post('/api/channel/:channelId/join', authenticateTelegram, async (req, res) => {
  try {
    const { channelId } = req.params;
    const user = req.user;
    
    // Проверить, что пользователь имеет доступ к серверу канала
    const result = await pool.query(`
      SELECT c.*, s.id as server_id 
      FROM channels c 
      JOIN servers s ON c.server_id = s.id 
      JOIN server_members sm ON s.id = sm.server_id 
      WHERE c.id = $1 AND sm.user_id = $2
    `, [channelId, user.id]);
    
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const channel = result.rows[0];
    await pool.query(
      'INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT (channel_id, user_id) DO NOTHING', 
      [channelId, user.id]
    );
    
    res.json({ success: true, channel });
  } catch (error) {
    console.error('Error in /api/channel/:channelId/join:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Получить участников канала
app.post('/api/channel/:channelId/members', authenticateTelegram, async (req, res) => {
  try {
    const { channelId } = req.params;
    const user = req.user;
    
    const result = await pool.query(`
      SELECT u.id, u.username, u.first_name, u.last_name, u.avatar, u.status, cm.joined_at
      FROM channel_members cm
      JOIN users u ON cm.user_id = u.id
      JOIN channels c ON cm.channel_id = c.id
      JOIN server_members sm ON c.server_id = sm.server_id AND u.id = sm.user_id
      WHERE cm.channel_id = $1 AND sm.user_id = $2
      ORDER BY cm.joined_at ASC
    `, [channelId, user.id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error in /api/channel/:channelId/members:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Получить информацию о пользователе по ID
app.post('/api/user/:userId', authenticateTelegram, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = req.user;
    
    const result = await pool.query(
      'SELECT id, username, first_name, last_name, avatar, status FROM users WHERE id = $1', 
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error in /api/user/:userId:', error);
    res.status(500).json({ error: error.message });
  }
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
        username: connectedUsers.get(id) ? 'User' : 'Unknown'
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

// Инициализация базы данных и запуск сервера
async function startServer() {
  try {
    await initDatabase();
    
    const PORT = process.env.PORT || 3000;
    
    if (process.env.NODE_ENV === 'production') {
      module.exports = app;
    } else {
      server.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📊 Database: PostgreSQL`);
        console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      });
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
