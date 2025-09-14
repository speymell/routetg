// Vercel API endpoint
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Функция для проверки подписи Telegram (упрощенная для разработки)
function verifyTelegramWebAppData(initData, botToken) {
  // Для разработки и тестирования пропускаем проверку подписи
  if (process.env.NODE_ENV !== 'production' || !botToken || botToken === 'YOUR_BOT_TOKEN') {
    return true;
  }
  
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

// Middleware для аутентификации
function authenticateTelegram(req, res, next) {
  const { initData } = req.body;
  
  // Если нет initData, используем тестовые данные
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
  
  // В продакшене используйте реальный bot token
  const botToken = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
  if (!verifyTelegramWebAppData(initData, botToken)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  try {
    const urlParams = new URLSearchParams(initData);
    const userParam = urlParams.get('user');
    if (userParam) {
      req.user = JSON.parse(userParam);
    } else {
      // Fallback для тестирования
      req.user = {
        id: 123,
        username: 'TestUser',
        first_name: 'Test',
        last_name: 'User',
        photo_url: ''
      };
    }
  } catch (error) {
    console.error('Error parsing user data:', error);
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

// In-memory хранилище для демо (в продакшене используйте реальную БД)
const users = new Map();
const servers = new Map();
const channels = new Map();
const serverMembers = new Map();
const channelMembers = new Map();

// Инициализация тестовых данных
function initTestData() {
  // Тестовый пользователь
  users.set(123, {
    id: 123,
    username: 'TestUser',
    first_name: 'Test',
    last_name: 'User',
    avatar: '',
    status: 'online',
    created_at: new Date().toISOString()
  });
  
  // Тестовый сервер
  const testServer = {
    id: 1,
    name: 'Тестовый сервер',
    description: 'Сервер для тестирования',
    owner_id: 123,
    invite_code: 'test123',
    created_at: new Date().toISOString()
  };
  servers.set(1, testServer);
  
  // Участник сервера
  serverMembers.set('1-123', {
    server_id: 1,
    user_id: 123,
    role: 'owner',
    joined_at: new Date().toISOString()
  });
  
  // Тестовый канал
  const testChannel = {
    id: 1,
    server_id: 1,
    name: 'Общий',
    type: 'voice',
    owner_id: 123,
    created_at: new Date().toISOString()
  };
  channels.set(1, testChannel);
}

// Инициализировать тестовые данные
initTestData();

// API: Получить/создать профиль пользователя
app.post('/api/profile', authenticateTelegram, (req, res) => {
  const user = req.user;
  
  if (!users.has(user.id)) {
    // Создать нового пользователя
    const newUser = {
      id: user.id,
      username: user.username || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      avatar: user.photo_url || '',
      status: 'online',
      created_at: new Date().toISOString()
    };
    users.set(user.id, newUser);
  } else {
    // Обновить данные существующего пользователя
    const existingUser = users.get(user.id);
    existingUser.username = user.username || existingUser.username;
    existingUser.first_name = user.first_name || existingUser.first_name;
    existingUser.last_name = user.last_name || existingUser.last_name;
    existingUser.avatar = user.photo_url || existingUser.avatar;
    users.set(user.id, existingUser);
  }
  
  const userData = users.get(user.id);
  res.json({
    id: userData.id,
    username: userData.username || `${userData.first_name} ${userData.last_name}`.trim(),
    first_name: userData.first_name,
    last_name: userData.last_name,
    avatar: userData.avatar,
    status: userData.status
  });
});

// API: Получить серверы пользователя
app.post('/api/servers', authenticateTelegram, (req, res) => {
  const user = req.user;
  const userServers = [];
  
  for (const [key, membership] of serverMembers.entries()) {
    if (membership.user_id === user.id) {
      const server = servers.get(membership.server_id);
      if (server) {
        userServers.push({
          ...server,
          role: membership.role
        });
      }
    }
  }
  
  res.json(userServers);
});

// API: Создать сервер
app.post('/api/server', authenticateTelegram, (req, res) => {
  const { name, description } = req.body;
  const user = req.user;
  const inviteCode = crypto.randomBytes(8).toString('hex');
  
  const serverId = Date.now(); // Простой ID генератор
  const server = {
    id: serverId,
    name,
    description: description || '',
    owner_id: user.id,
    invite_code: inviteCode,
    created_at: new Date().toISOString()
  };
  
  servers.set(serverId, server);
  
  // Добавить владельца как участника сервера
  serverMembers.set(`${serverId}-${user.id}`, {
    server_id: serverId,
    user_id: user.id,
    role: 'owner',
    joined_at: new Date().toISOString()
  });
  
  // Создать общий канал
  const channelId = Date.now() + 1;
  const channel = {
    id: channelId,
    server_id: serverId,
    name: 'Общий',
    type: 'voice',
    owner_id: user.id,
    created_at: new Date().toISOString()
  };
  channels.set(channelId, channel);
  
  res.json({
    id: serverId,
    name,
    description: description || '',
    invite_code: inviteCode,
    role: 'owner'
  });
});

// API: Присоединиться к серверу по invite коду
app.post('/api/server/join', authenticateTelegram, (req, res) => {
  const { inviteCode } = req.body;
  const user = req.user;
  
  let server = null;
  for (const [id, s] of servers.entries()) {
    if (s.invite_code === inviteCode) {
      server = s;
      break;
    }
  }
  
  if (!server) {
    return res.status(404).json({ error: 'Server not found' });
  }
  
  // Добавить пользователя в сервер
  serverMembers.set(`${server.id}-${user.id}`, {
    server_id: server.id,
    user_id: user.id,
    role: 'member',
    joined_at: new Date().toISOString()
  });
  
  res.json({ success: true, server });
});

// API: Получить каналы сервера
app.post('/api/server/:serverId/channels', authenticateTelegram, (req, res) => {
  const { serverId } = req.params;
  const user = req.user;
  
  // Проверить, что пользователь является участником сервера
  const membership = serverMembers.get(`${serverId}-${user.id}`);
  if (!membership) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const serverChannels = [];
  for (const [id, channel] of channels.entries()) {
    if (channel.server_id == serverId) {
      serverChannels.push(channel);
    }
  }
  
  res.json(serverChannels);
});

// API: Создать канал
app.post('/api/server/:serverId/channel', authenticateTelegram, (req, res) => {
  const { serverId } = req.params;
  const { name, type } = req.body;
  const user = req.user;
  
  // Проверить права (только владелец или админ)
  const membership = serverMembers.get(`${serverId}-${user.id}`);
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  
  const channelId = Date.now();
  const channel = {
    id: channelId,
    server_id: parseInt(serverId),
    name,
    type: type || 'voice',
    owner_id: user.id,
    created_at: new Date().toISOString()
  };
  
  channels.set(channelId, channel);
  
  res.json({ id: channelId, name, type: type || 'voice' });
});

// API: Присоединиться к каналу
app.post('/api/channel/:channelId/join', authenticateTelegram, (req, res) => {
  const { channelId } = req.params;
  const user = req.user;
  
  const channel = channels.get(parseInt(channelId));
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  
  // Проверить, что пользователь имеет доступ к серверу канала
  const membership = serverMembers.get(`${channel.server_id}-${user.id}`);
  if (!membership) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  // Добавить в канал
  channelMembers.set(`${channelId}-${user.id}`, {
    channel_id: parseInt(channelId),
    user_id: user.id,
    joined_at: new Date().toISOString()
  });
  
  res.json({ success: true, channel });
});

// Статические файлы
app.use(express.static('frontend'));

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/../frontend/index.html');
});

module.exports = app;
