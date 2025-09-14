// Упрощенная версия сервера для Vercel
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

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

// API endpoints (упрощенные для тестирования)
app.post('/api/profile', (req, res) => {
  res.json({
    id: 123,
    username: 'TestUser',
    first_name: 'Test',
    last_name: 'User',
    avatar: '',
    status: 'online'
  });
});

app.post('/api/servers', (req, res) => {
  res.json([]);
});

app.post('/api/server', (req, res) => {
  res.json({
    id: 1,
    name: req.body.name || 'Test Server',
    description: req.body.description || '',
    invite_code: 'test123',
    role: 'owner'
  });
});

app.post('/api/server/:serverId/channels', (req, res) => {
  res.json([
    {
      id: 1,
      name: 'Общий',
      type: 'voice',
      server_id: req.params.serverId
    }
  ]);
});

app.post('/api/server/:serverId/channel', (req, res) => {
  res.json({
    id: Date.now(),
    name: req.body.name || 'New Channel',
    type: 'voice'
  });
});

app.post('/api/channel/:channelId/join', (req, res) => {
  res.json({
    success: true,
    channel: {
      id: req.params.channelId,
      name: 'Test Channel'
    }
  });
});

app.post('/api/channel/:channelId/members', (req, res) => {
  res.json([]);
});

app.post('/api/server/join', (req, res) => {
  res.json({
    success: true,
    server: {
      id: 1,
      name: 'Test Server'
    }
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
