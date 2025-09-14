#!/bin/bash

# RouteTG - Скрипт запуска

echo "🚀 Запуск RouteTG..."

# Проверка Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не установлен. Установите Node.js 18+ и попробуйте снова."
    exit 1
fi

# Проверка версии Node.js
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Требуется Node.js версии 18 или выше. Текущая версия: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) найден"

# Переход в директорию backend
cd backend

# Проверка package.json
if [ ! -f "package.json" ]; then
    echo "❌ package.json не найден в директории backend"
    exit 1
fi

# Установка зависимостей
echo "📦 Установка зависимостей..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Ошибка установки зависимостей"
    exit 1
fi

# Проверка переменных окружения
if [ ! -f ".env" ]; then
    echo "⚠️  Файл .env не найден"
    echo "📝 Создайте файл .env на основе env.example:"
    echo "   cp env.example .env"
    echo "   # Затем отредактируйте .env и добавьте BOT_TOKEN"
    echo ""
    echo "🔧 Для тестирования можно запустить без .env (с ограниченной функциональностью)"
    read -p "Продолжить? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Запуск сервера
echo "🎯 Запуск сервера..."
echo "📱 Откройте http://localhost:3000 в браузере"
echo "🔗 Для Telegram WebApp настройте домен в @BotFather"
echo ""
echo "⏹️  Для остановки нажмите Ctrl+C"
echo ""

npm start
