# Архитектура RouteTG

## Общая схема

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Telegram      │    │   Frontend      │    │   Backend       │
│   WebApp        │    │   (Browser)     │    │   (Node.js)     │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ • Аутентификация│◄──►│ • UI/UX         │◄──►│ • Express API   │
│ • Профиль       │    │ • WebRTC Client │    │ • Socket.IO     │
│ • WebApp API    │    │ • Telegram SDK  │    │ • SQLite DB     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Компоненты системы

### 1. Frontend (Клиент)
```
frontend/
├── index.html          # Основная страница
├── styles.css          # Стили в стиле Discord
└── app.js             # Логика приложения
```

**Функции:**
- Интерфейс пользователя
- WebRTC клиент для голосовых звонков
- Интеграция с Telegram WebApp API
- Управление состоянием приложения

### 2. Backend (Сервер)
```
backend/
├── server.js          # Основной сервер
├── package.json       # Зависимости
└── app.db            # База данных SQLite
```

**Функции:**
- REST API для управления серверами/каналами
- WebRTC signaling через Socket.IO
- Аутентификация через Telegram
- Управление базой данных

### 3. База данных
```
SQLite Tables:
├── users              # Пользователи
├── servers            # Серверы
├── server_members     # Участники серверов
├── channels           # Каналы
└── channel_members    # Участники каналов
```

## Поток данных

### 1. Аутентификация
```
Telegram → Frontend → Backend → SQLite
    ↓         ↓         ↓         ↓
  initData → API Call → Verify → Create/Update User
```

### 2. Создание сервера
```
Frontend → Backend → SQLite
    ↓         ↓         ↓
  Form → API Call → Create Server + Channel + Membership
```

### 3. Голосовой чат
```
User A ←→ WebRTC ←→ User B
  ↓                    ↓
Socket.IO ←→ Backend ←→ Socket.IO
  ↓                    ↓
Signaling (Offer/Answer/ICE)
```

## API Endpoints

### Аутентификация
- `POST /api/profile` - Получить/создать профиль
- `POST /api/profile/status` - Обновить статус

### Серверы
- `POST /api/servers` - Список серверов пользователя
- `POST /api/server` - Создать сервер
- `POST /api/server/join` - Присоединиться к серверу
- `POST /api/server/:id/channels` - Каналы сервера

### Каналы
- `POST /api/server/:id/channel` - Создать канал
- `POST /api/channel/:id/join` - Присоединиться к каналу
- `POST /api/channel/:id/members` - Участники канала

## WebRTC Signaling

### 1. Подключение к каналу
```
Client → Socket.IO → Server
  ↓
emit('join-channel', {channelId, userId, username})
  ↓
Server → Other Clients
  ↓
emit('user-joined', {userId, username})
```

### 2. WebRTC Negotiation
```
Client A → Client B
  ↓
createOffer() → emit('offer')
  ↓
Client B: setRemoteDescription() → createAnswer()
  ↓
emit('answer') → Client A: setRemoteDescription()
  ↓
ICE Candidates exchange
```

## Безопасность

### 1. Аутентификация Telegram
```javascript
// Проверка подписи initData
function verifyTelegramWebAppData(initData, botToken) {
  // HMAC-SHA256 проверка
  // Сравнение с полученным hash
}
```

### 2. Авторизация
- Проверка членства в сервере
- Роли пользователей (owner, admin, member)
- Права на создание каналов

### 3. CORS и Helmet
- Настройка CORS для домена
- Защита заголовков через Helmet
- HTTPS для продакшена

## Масштабирование

### Горизонтальное масштабирование
```
Load Balancer → Multiple Backend Instances
                    ↓
              Shared Database (PostgreSQL)
                    ↓
              Redis for Socket.IO Sessions
```

### Вертикальное масштабирование
- Увеличение ресурсов сервера
- Оптимизация SQLite запросов
- Кэширование статических файлов

## Мониторинг

### Логи
- Серверные логи (Express)
- WebRTC соединения
- Ошибки базы данных

### Метрики
- Количество активных пользователей
- Время отклика API
- Качество WebRTC соединений

## Развертывание

### Development
```bash
cd backend
npm install
npm start
```

### Production
```bash
# Docker
docker build -t routetg .
docker run -p 3000:3000 -e BOT_TOKEN=xxx routetg

# Heroku
heroku create routetg
heroku config:set BOT_TOKEN=xxx
git push heroku main
```

## Будущие улучшения

### 1. Микросервисная архитектура
- Отдельный сервис для WebRTC signaling
- Сервис аутентификации
- Сервис управления каналами

### 2. Real-time функции
- Текстовые сообщения
- Уведомления
- Статусы пользователей

### 3. Медиа функции
- Видеозвонки
- Демонстрация экрана
- Файловый обмен
