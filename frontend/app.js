// Глобальные переменные
let tg = window.Telegram.WebApp;
let socket = null;
let currentUser = null;
let currentServer = null;
let currentChannel = null;
let localStream = null;
let peerConnections = {};
let isMuted = false;

// Инициализация
async function init() {
  try {
    tg.ready();
    tg.expand();
    
    // Получить данные пользователя из Telegram
    const initData = tg.initDataUnsafe;
    if (initData.user) {
      currentUser = initData.user;
      updateUserProfile();
    } else {
      // Для тестирования
      currentUser = { id: 123, username: 'TestUser', first_name: 'Test', last_name: 'User' };
      updateUserProfile();
    }

    // Подключиться к серверу
    await connectToServer();
    
    // Загрузить серверы пользователя
    await loadUserServers();
    
  } catch (error) {
    console.error('Ошибка инициализации:', error);
    showError('Ошибка инициализации приложения');
  }
}

// Обновить профиль пользователя
function updateUserProfile() {
  const avatar = document.getElementById('userAvatar');
  const name = document.getElementById('userName');
  const status = document.getElementById('userStatus');
  
  if (currentUser.photo_url) {
    avatar.style.backgroundImage = `url(${currentUser.photo_url})`;
    avatar.style.backgroundSize = 'cover';
    avatar.textContent = '';
  } else {
    avatar.textContent = (currentUser.first_name?.[0] || currentUser.username?.[0] || 'U').toUpperCase();
  }
  
  name.textContent = currentUser.username || `${currentUser.first_name} ${currentUser.last_name}`.trim();
  status.textContent = 'Онлайн';
}

// Подключиться к серверу
async function connectToServer() {
  try {
    // Получаем initData из Telegram или используем тестовые данные
    let initData = null;
    if (tg && tg.initData) {
      initData = tg.initData;
    }
    
    const response = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: initData })
    });
    
    if (!response.ok) {
      throw new Error('Ошибка аутентификации');
    }
    
    const userData = await response.json();
    currentUser = { ...currentUser, ...userData };
    updateUserProfile();
    
    // Подключиться к Socket.IO (пока отключено для Vercel)
    // socket = io();
    // socket.emit('authenticate', { 
    //   userId: currentUser.id, 
    //   username: currentUser.username || currentUser.first_name 
    // });
    
  } catch (error) {
    console.error('Ошибка подключения:', error);
    showError('Ошибка подключения к серверу');
  }
}

// Загрузить серверы пользователя
async function loadUserServers() {
  try {
    let initData = null;
    if (tg && tg.initData) {
      initData = tg.initData;
    }
    
    const response = await fetch('/api/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: initData })
    });
    
    if (!response.ok) {
      throw new Error('Ошибка загрузки серверов');
    }
    
    const servers = await response.json();
    renderServers(servers);
    
  } catch (error) {
    console.error('Ошибка загрузки серверов:', error);
    showError('Ошибка загрузки серверов');
  }
}

// Отобразить серверы
function renderServers(servers) {
  const container = document.getElementById('serversList');
  container.innerHTML = '';
  
  servers.forEach(server => {
    const serverElement = document.createElement('div');
    serverElement.className = 'server-item';
    serverElement.innerHTML = `
      <div class="server-icon">${server.name[0].toUpperCase()}</div>
      <div class="server-name">${server.name}</div>
    `;
    serverElement.onclick = () => selectServer(server);
    container.appendChild(serverElement);
  });
}

// Выбрать сервер
async function selectServer(server) {
  currentServer = server;
  
  // Обновить UI
  document.querySelectorAll('.server-item').forEach(item => item.classList.remove('active'));
  event.target.closest('.server-item').classList.add('active');
  
  document.getElementById('currentServerName').textContent = server.name;
  document.getElementById('currentServerDescription').textContent = server.description || '';
  
  // Показать кнопку создания канала для владельца/админа
  const createChannelBtn = document.getElementById('createChannelBtn');
  if (['owner', 'admin'].includes(server.role)) {
    createChannelBtn.style.display = 'block';
  } else {
    createChannelBtn.style.display = 'none';
  }
  
  // Загрузить каналы сервера
  await loadServerChannels(server.id);
}

// Загрузить каналы сервера
async function loadServerChannels(serverId) {
  try {
    const container = document.getElementById('channelsContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Загрузка каналов...</div>';
    
    let initData = null;
    if (tg && tg.initData) {
      initData = tg.initData;
    }
    
    const response = await fetch(`/api/server/${serverId}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: initData })
    });
    
    if (!response.ok) {
      throw new Error('Ошибка загрузки каналов');
    }
    
    const channels = await response.json();
    renderChannels(channels);
    
  } catch (error) {
    console.error('Ошибка загрузки каналов:', error);
    showError('Ошибка загрузки каналов');
  }
}

// Отобразить каналы
function renderChannels(channels) {
  const container = document.getElementById('channelsContainer');
  
  if (channels.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <i class="fas fa-microphone-slash" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
        <h3>Нет голосовых каналов</h3>
        <p>Создайте первый канал для начала общения</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = '<div class="channels-grid"></div>';
  const grid = container.querySelector('.channels-grid');
  
  channels.forEach(channel => {
    const channelElement = document.createElement('div');
    channelElement.className = 'channel-card';
    channelElement.innerHTML = `
      <div class="channel-header">
        <div class="channel-icon">
          <i class="fas fa-microphone"></i>
        </div>
        <div class="channel-info">
          <h3>${channel.name}</h3>
          <div class="channel-type">Голосовой канал</div>
        </div>
      </div>
      <div class="channel-stats">
        <div class="participants-count">
          <i class="fas fa-users"></i>
          <span id="participants-${channel.id}">0 участников</span>
        </div>
        <button class="join-btn" onclick="joinChannel(${channel.id}, '${channel.name}')">
          Присоединиться
        </button>
      </div>
    `;
    grid.appendChild(channelElement);
  });
}

// Присоединиться к каналу
async function joinChannel(channelId, channelName) {
  try {
    currentChannel = { id: channelId, name: channelName };
    
    let initData = null;
    if (tg && tg.initData) {
      initData = tg.initData;
    }
    
    // Присоединиться к каналу через API
    const response = await fetch(`/api/channel/${channelId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: initData })
    });
    
    if (!response.ok) {
      throw new Error('Ошибка присоединения к каналу');
    }
    
    // Показать голосовой чат
    showVoiceChat();
    
    // Начать голосовое соединение (пока отключено)
    // await startVoiceConnection(channelId);
    
  } catch (error) {
    console.error('Ошибка присоединения к каналу:', error);
    showError('Ошибка присоединения к каналу');
  }
}

// Показать голосовой чат
function showVoiceChat() {
  const voiceChat = document.getElementById('voiceChat');
  const channelName = document.getElementById('currentChannelName');
  
  voiceChat.classList.add('active');
  channelName.textContent = currentChannel.name;
}

// Начать голосовое соединение
async function startVoiceConnection(channelId) {
  try {
    // Получить доступ к микрофону
    localStream = await navigator.mediaDevices.getUserMedia({ 
      audio: { 
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    });
    
    // Присоединиться к каналу через Socket.IO
    socket.emit('join-channel', {
      channelId: channelId,
      userId: currentUser.id,
      username: currentUser.username || currentUser.first_name
    });
    
    // Настроить обработчики WebRTC
    setupWebRTCHandlers();
    
  } catch (error) {
    console.error('Ошибка доступа к микрофону:', error);
    showError('Не удалось получить доступ к микрофону');
  }
}

// Настроить обработчики WebRTC
function setupWebRTCHandlers() {
  socket.on('user-joined', async (data) => {
    await createPeerConnection(data.userId, data.socketId, true);
  });
  
  socket.on('user-left', (data) => {
    removeParticipant(data.userId);
    if (peerConnections[data.userId]) {
      peerConnections[data.userId].close();
      delete peerConnections[data.userId];
    }
  });
  
  socket.on('channel-users', (users) => {
    users.forEach(user => {
      createPeerConnection(user.userId, user.socketId, false);
    });
  });
  
  socket.on('offer', async (data) => {
    await handleOffer(data);
  });
  
  socket.on('answer', async (data) => {
    await handleAnswer(data);
  });
  
  socket.on('ice-candidate', async (data) => {
    await handleIceCandidate(data);
  });
  
  socket.on('user-mute-changed', (data) => {
    updateParticipantMute(data.userId, data.isMuted);
  });
}

// Создать peer connection
async function createPeerConnection(userId, socketId, isInitiator) {
  const peerConnection = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });
  
  peerConnections[userId] = peerConnection;
  
  // Добавить локальный поток
  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
  }
  
  // Обработка удаленного потока
  peerConnection.ontrack = (event) => {
    const remoteStream = event.streams[0];
    addParticipant(userId, remoteStream);
  };
  
  // Обработка ICE кандидатов
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        target: userId,
        candidate: event.candidate,
        from: currentUser.id
      });
    }
  };
  
  // Создать offer если инициатор
  if (isInitiator) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', {
      target: userId,
      offer: offer,
      from: currentUser.id
    });
  }
}

// Обработать offer
async function handleOffer(data) {
  const peerConnection = peerConnections[data.from] || new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });
  
  peerConnections[data.from] = peerConnection;
  
  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
  }
  
  peerConnection.ontrack = (event) => {
    const remoteStream = event.streams[0];
    addParticipant(data.from, remoteStream);
  };
  
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        target: data.from,
        candidate: event.candidate,
        from: currentUser.id
      });
    }
  };
  
  await peerConnection.setRemoteDescription(data.offer);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  
  socket.emit('answer', {
    target: data.from,
    answer: answer,
    from: currentUser.id
  });
}

// Обработать answer
async function handleAnswer(data) {
  const peerConnection = peerConnections[data.from];
  if (peerConnection) {
    await peerConnection.setRemoteDescription(data.answer);
  }
}

// Обработать ICE кандидат
async function handleIceCandidate(data) {
  const peerConnection = peerConnections[data.from];
  if (peerConnection) {
    await peerConnection.addIceCandidate(data.candidate);
  }
}

// Добавить участника
function addParticipant(userId, stream) {
  const participantsList = document.getElementById('participantsList');
  
  // Проверить, не добавлен ли уже участник
  if (document.getElementById(`participant-${userId}`)) {
    return;
  }
  
  const participantElement = document.createElement('div');
  participantElement.className = 'participant';
  participantElement.id = `participant-${userId}`;
  participantElement.innerHTML = `
    <div class="participant-avatar">${userId.toString()[0]}</div>
    <span>Пользователь ${userId}</span>
  `;
  
  participantsList.appendChild(participantElement);
  
  // Создать аудио элемент для воспроизведения
  const audio = document.createElement('audio');
  audio.srcObject = stream;
  audio.autoplay = true;
  audio.id = `audio-${userId}`;
  document.body.appendChild(audio);
}

// Удалить участника
function removeParticipant(userId) {
  const participantElement = document.getElementById(`participant-${userId}`);
  const audioElement = document.getElementById(`audio-${userId}`);
  
  if (participantElement) {
    participantElement.remove();
  }
  
  if (audioElement) {
    audioElement.remove();
  }
}

// Обновить статус микрофона участника
function updateParticipantMute(userId, isMuted) {
  const participantElement = document.getElementById(`participant-${userId}`);
  if (participantElement) {
    if (isMuted) {
      participantElement.classList.add('muted');
    } else {
      participantElement.classList.remove('muted');
    }
  }
}

// Переключить микрофон
function toggleMute() {
  isMuted = !isMuted;
  const muteBtn = document.getElementById('muteBtn');
  
  if (isMuted) {
    muteBtn.classList.add('muted');
    muteBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = false;
      });
    }
  } else {
    muteBtn.classList.remove('muted');
    muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = true;
      });
    }
  }
  
  // Уведомить других участников
  if (currentChannel) {
    socket.emit('mute-toggle', {
      channelId: currentChannel.id,
      isMuted: isMuted
    });
  }
}

// Покинуть голосовой чат
function leaveVoiceChat() {
  const voiceChat = document.getElementById('voiceChat');
  voiceChat.classList.remove('active');
  
  // Остановить локальный поток
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  // Закрыть все peer connections
  Object.values(peerConnections).forEach(pc => pc.close());
  peerConnections = {};
  
  // Покинуть канал
  if (currentChannel && socket) {
    socket.emit('leave-channel', {
      channelId: currentChannel.id,
      userId: currentUser.id
    });
  }
  
  // Очистить участников
  document.getElementById('participantsList').innerHTML = '';
  
  currentChannel = null;
  isMuted = false;
}

// Модальные окна
function showCreateServerModal() {
  document.getElementById('createServerModal').classList.add('active');
}

function hideCreateServerModal() {
  document.getElementById('createServerModal').classList.remove('active');
  document.getElementById('serverNameInput').value = '';
  document.getElementById('serverDescriptionInput').value = '';
}

function showJoinServerModal() {
  document.getElementById('joinServerModal').classList.add('active');
}

function hideJoinServerModal() {
  document.getElementById('joinServerModal').classList.remove('active');
  document.getElementById('inviteCodeInput').value = '';
}

function showCreateChannelModal() {
  if (!currentServer) {
    showError('Выберите сервер');
    return;
  }
  document.getElementById('createChannelModal').classList.add('active');
}

function hideCreateChannelModal() {
  document.getElementById('createChannelModal').classList.remove('active');
  document.getElementById('channelNameInput').value = '';
}

// Создать сервер
async function createServer() {
  const name = document.getElementById('serverNameInput').value.trim();
  const description = document.getElementById('serverDescriptionInput').value.trim();
  
  if (!name) {
    showError('Введите название сервера');
    return;
  }
  
  try {
    let initData = null;
    if (tg && tg.initData) {
      initData = tg.initData;
    }
    
    const response = await fetch('/api/server', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        initData: initData,
        name: name,
        description: description
      })
    });
    
    if (!response.ok) {
      throw new Error('Ошибка создания сервера');
    }
    
    const server = await response.json();
    hideCreateServerModal();
    await loadUserServers();
    showSuccess(`Сервер "${server.name}" создан! Код приглашения: ${server.invite_code}`);
    
  } catch (error) {
    console.error('Ошибка создания сервера:', error);
    showError('Ошибка создания сервера');
  }
}

// Присоединиться к серверу
async function joinServer() {
  const inviteCode = document.getElementById('inviteCodeInput').value.trim();
  
  if (!inviteCode) {
    showError('Введите код приглашения');
    return;
  }
  
  try {
    let initData = null;
    if (tg && tg.initData) {
      initData = tg.initData;
    }
    
    const response = await fetch('/api/server/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        initData: initData,
        inviteCode: inviteCode
      })
    });
    
    if (!response.ok) {
      throw new Error('Ошибка присоединения к серверу');
    }
    
    const result = await response.json();
    hideJoinServerModal();
    await loadUserServers();
    showSuccess(`Вы присоединились к серверу "${result.server.name}"`);
    
  } catch (error) {
    console.error('Ошибка присоединения к серверу:', error);
    showError('Ошибка присоединения к серверу');
  }
}

// Создать канал
async function createChannel() {
  const name = document.getElementById('channelNameInput').value.trim();
  
  if (!name) {
    showError('Введите название канала');
    return;
  }
  
  try {
    let initData = null;
    if (tg && tg.initData) {
      initData = tg.initData;
    }
    
    const response = await fetch(`/api/server/${currentServer.id}/channel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        initData: initData,
        name: name,
        type: 'voice'
      })
    });
    
    if (!response.ok) {
      throw new Error('Ошибка создания канала');
    }
    
    const channel = await response.json();
    hideCreateChannelModal();
    await loadServerChannels(currentServer.id);
    showSuccess(`Канал "${channel.name}" создан!`);
    
  } catch (error) {
    console.error('Ошибка создания канала:', error);
    showError('Ошибка создания канала');
  }
}

// Утилиты
function showError(message) {
  if (tg && tg.showAlert) {
    tg.showAlert(message);
  } else {
    alert(message);
  }
}

function showSuccess(message) {
  if (tg && tg.showAlert) {
    tg.showAlert(message);
  } else {
    alert(message);
  }
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', init);
