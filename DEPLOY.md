# 🚀 Деплой RouteTG на Vercel

## Подготовка к деплою

### 1. Настройка переменных окружения в Vercel

1. Откройте ваш проект в [Vercel Dashboard](https://vercel.com/dashboard)
2. Перейдите в **Settings** → **Environment Variables**
3. Добавьте переменные:
   - `BOT_TOKEN` - токен вашего Telegram бота
   - `NODE_ENV` - `production`

### 2. Настройка Telegram WebApp

1. Откройте [@BotFather](https://t.me/BotFather)
2. Выберите вашего бота
3. Выполните команду `/newapp`
4. Настройте:
   - **Title**: RouteTG
   - **Description**: Голосовой чат для Telegram
   - **Web App URL**: `https://your-app-name.vercel.app`

## Деплой

### Автоматический деплой (рекомендуется)

1. Подключите GitHub репозиторий к Vercel
2. Vercel автоматически задеплоит при каждом push в main ветку

### Ручной деплой

```bash
# Установите Vercel CLI
npm i -g vercel

# Логин в Vercel
vercel login

# Деплой
vercel --prod
```

## Проверка деплоя

1. Откройте ваш домен Vercel
2. Должна загрузиться главная страница RouteTG
3. Проверьте API: `https://your-app.vercel.app/api/profile`

## Возможные проблемы

### 404 ошибка
- Убедитесь, что файл `vercel.json` настроен правильно
- Проверьте, что `api/index.js` существует

### Ошибки базы данных
- SQLite файлы не сохраняются между деплоями
- Для продакшена используйте PostgreSQL или другую облачную БД

### WebRTC не работает
- HTTPS обязателен для WebRTC
- Vercel автоматически предоставляет HTTPS

## Обновление

После изменений в коде:

```bash
git add .
git commit -m "Update app"
git push origin main
```

Vercel автоматически задеплоит обновления.
