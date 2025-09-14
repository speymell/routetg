// Упрощенная версия сервера для Vercel
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const crypto = require('crypto');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Статические файлы
app.use(express.static(path.join(__dirname, '../frontend')));

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Простая версия без внешних скриптов
app.get('/simple', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index-simple.html'));
});

// Функция для проверки подписи Telegram
function verifyTelegramWebAppData(initData, botToken) {
  if (!initData || !botToken) return false;
  
  try {
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
  } catch (error) {
    console.error('Error verifying Telegram data:', error);
    return false;
  }
}

// Middleware для аутентификации Telegram
function authenticateTelegram(req, res, next) {
  const { initData } = req.body;
  
  // Для тестирования без Telegram
  if (!initData) {
    req.user = { 
      id: 123, 
      username: 'TestUser', 
      first_name: 'Test', 
      last_name: 'User',
      photo_url: ''
    };
    return next();
  }
  
  // В продакшене проверяем подпись
  const botToken = process.env.BOT_TOKEN;
  if (botToken && !verifyTelegramWebAppData(initData, botToken)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Парсим данные пользователя
  const urlParams = new URLSearchParams(initData);
  const userParam = urlParams.get('user');
  if (userParam) {
    req.user = JSON.parse(userParam);
  } else {
    req.user = { 
      id: 123, 
      username: 'TestUser', 
      first_name: 'Test', 
      last_name: 'User',
      photo_url: ''
    };
  }
  
  next();
}

// API endpoints
app.post('/api/profile', authenticateTelegram, (req, res) => {
  const user = req.user;
  res.json({
    id: user.id,
    username: user.username || `${user.first_name} ${user.last_name}`.trim(),
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    avatar: user.photo_url || '',
    status: 'online'
  });
});

// Временное хранилище (в продакшене используйте базу данных)
let servers = [];
let channels = [];

app.post('/api/servers', authenticateTelegram, (req, res) => {
  const user = req.user;
  const userServers = servers.filter(s => s.owner_id === user.id);
  res.json(userServers);
});

app.post('/api/server', authenticateTelegram, (req, res) => {
  const { name, description } = req.body;
  const user = req.user;
  
  if (!name) {
    return res.status(400).json({ error: 'Server name is required' });
  }
  
  const server = {
    id: Date.now(),
    name: name,
    description: description || '',
    owner_id: user.id,
    invite_code: Math.random().toString(36).substring(2, 10),
    role: 'owner',
    created_at: new Date().toISOString()
  };
  
  servers.push(server);
  
  // Создаем общий канал
  const channel = {
    id: Date.now() + 1,
    name: 'Общий',
    type: 'voice',
    server_id: server.id,
    owner_id: user.id,
    created_at: new Date().toISOString()
  };
  
  channels.push(channel);
  
  res.json(server);
});

app.post('/api/server/:serverId/channels', authenticateTelegram, (req, res) => {
  const serverId = parseInt(req.params.serverId);
  const serverChannels = channels.filter(c => c.server_id === serverId);
  res.json(serverChannels);
});

app.post('/api/server/:serverId/channel', authenticateTelegram, (req, res) => {
  const { name, type } = req.body;
  const serverId = parseInt(req.params.serverId);
  const user = req.user;
  
  if (!name) {
    return res.status(400).json({ error: 'Channel name is required' });
  }
  
  const channel = {
    id: Date.now(),
    name: name,
    type: type || 'voice',
    server_id: serverId,
    owner_id: user.id,
    created_at: new Date().toISOString()
  };
  
  channels.push(channel);
  res.json(channel);
});

app.post('/api/channel/:channelId/join', authenticateTelegram, (req, res) => {
  const channelId = parseInt(req.params.channelId);
  const channel = channels.find(c => c.id === channelId);
  
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  
  res.json({
    success: true,
    channel: channel
  });
});

app.post('/api/channel/:channelId/members', authenticateTelegram, (req, res) => {
  res.json([]);
});

app.post('/api/server/join', authenticateTelegram, (req, res) => {
  const { inviteCode } = req.body;
  const user = req.user;
  
  if (!inviteCode) {
    return res.status(400).json({ error: 'Invite code is required' });
  }
  
  const server = servers.find(s => s.invite_code === inviteCode);
  
  if (!server) {
    return res.status(404).json({ error: 'Server not found' });
  }
  
  res.json({
    success: true,
    server: server
  });
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

module.exports = app;
