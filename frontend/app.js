// Глобальные переменные
let tg = null;
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
    console.log('Initializing app...');
    
    // Проверяем Telegram WebApp
    if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
      tg = window.Telegram.WebApp;
      console.log('Telegram WebApp detected');
      
      try {
        tg.ready();
        tg.expand();
      } catch (e) {
        console.warn('Telegram WebApp methods failed:', e);
      }
      
      // Получить данные пользователя из Telegram
      const initData = tg.initDataUnsafe;
      console.log('Telegram initData:', initData);
      
      if (initData && initData.user) {
        currentUser = initData.user;
        console.log('Telegram user data:', currentUser);
      } else {
        // Для тестирования
        currentUser = { 
          id: 123, 
          username: 'TestUser', 
          first_name: 'Test', 
          last_name: 'User',
          photo_url: ''
        };
        console.log('Using test user data:', currentUser);
      }
    } else {
      console.log('Telegram WebApp not detected, using test data');
      // Для тестирования в браузере
      currentUser = { 
        id: 123, 
        username: 'TestUser', 
        first_name: 'Test', 
        last_name: 'User',
        photo_url: ''
      };
    }
    
    updateUserProfile();

    // Подключиться к серверу
    await connectToServer();
    
    // Загрузить серверы пользователя
    await loadUserServers();
    
    // Показываем начальное сообщение
    const container = document.getElementById('channelsContainer');
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          <i class="fas fa-microphone-slash" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
          <h3>Добро пожаловать в RouteTG!</h3>
          <p>Создайте сервер или присоединитесь к существующему для начала общения</p>
        </div>
      `;
    }
    
    console.log('App initialized successfully');
    
  } catch (error) {
    console.error('Ошибка инициализации:', error);
    showError('Ошибка инициализации приложения: ' + error.message);
  }
}

// Обновить профиль пользователя
function updateUserProfile() {
  console.log('Updating user profile...');
  const avatar = document.getElementById('userAvatar');
  const name = document.getElementById('userName');
  const status = document.getElementById('userStatus');
  
  if (!avatar || !name || !status) {
    console.error('Profile elements not found:', { avatar, name, status });
    return;
  }
  
  console.log('Current user data:', currentUser);
  
  // Очищаем предыдущие стили
  avatar.style.backgroundImage = '';
  avatar.style.backgroundSize = '';
  avatar.style.backgroundPosition = '';
  
  if (currentUser.avatar || currentUser.photo_url) {
    const photoUrl = currentUser.avatar || currentUser.photo_url;
    console.log('Setting avatar image:', photoUrl);
    avatar.style.backgroundImage = `url(${photoUrl})`;
    avatar.style.backgroundSize = 'cover';
    avatar.style.backgroundPosition = 'center';
    avatar.textContent = '';
  } else {
    // Генерируем инициалы
    const firstName = currentUser.first_name || '';
    const lastName = currentUser.last_name || '';
    const username = currentUser.username || '';
    
    let initials = '';
    if (firstName) {
      initials += firstName[0].toUpperCase();
    }
    if (lastName) {
      initials += lastName[0].toUpperCase();
    }
    if (!initials && username) {
      initials = username[0].toUpperCase();
    }
    if (!initials) {
      initials = 'U';
    }
    
    console.log('Setting initials:', initials);
    avatar.textContent = initials;
  }
  
  // Отображаем имя
  const displayName = currentUser.username || 
                     `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() ||
                     'Пользователь';
  console.log('Setting display name:', displayName);
  name.textContent = displayName;
  status.textContent = 'Онлайн';
  
  console.log('Profile updated successfully');
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
      const errorText = await response.text();
      console.error('API Error:', response.status, errorText);
      throw new Error(`Ошибка аутентификации: ${response.status}`);
    }
    
    const userData = await response.json();
    currentUser = { ...currentUser, ...userData };
    updateUserProfile();
    
    console.log('Successfully connected to server');
    
    // Подключиться к Socket.IO (пока отключено для Vercel)
    // socket = io();
    // socket.emit('authenticate', { 
    //   userId: currentUser.id, 
    //   username: currentUser.username || currentUser.first_name 
    // });
    
  } catch (error) {
    console.error('Ошибка подключения:', error);
    // Не показываем ошибку пользователю, используем тестовые данные
    console.log('Using fallback user data');
    currentUser = { 
      id: 123, 
      username: 'TestUser', 
      first_name: 'Test', 
      last_name: 'User',
      photo_url: ''
    };
    updateUserProfile();
  }
}

// Загрузить серверы пользователя
async function loadUserServers() {
  try {
    console.log('Loading user servers...');
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
      const errorText = await response.text();
      console.error('API Error:', response.status, errorText);
      throw new Error(`Ошибка загрузки серверов: ${response.status}`);
    }
    
    const servers = await response.json();
    console.log('Loaded servers:', servers);
    renderServers(servers);
    
  } catch (error) {
    console.error('Ошибка загрузки серверов:', error);
    // Показываем пустой список серверов вместо ошибки
    renderServers([]);
  }
}

// Отобразить серверы
function renderServers(servers) {
  const container = document.getElementById('serversList');
  if (!container) {
    console.error('serversList container not found');
    return;
  }
  
  container.innerHTML = '';
  
  if (servers.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 14px;">
        <i class="fas fa-server" style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;"></i>
        <div>Нет серверов</div>
        <div style="font-size: 12px; margin-top: 4px;">Создайте или присоединитесь к серверу</div>
      </div>
    `;
    return;
  }
  
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
  
  // Найти и активировать выбранный сервер
  const serverItems = document.querySelectorAll('.server-item');
  serverItems.forEach(item => {
    const serverName = item.querySelector('.server-name');
    if (serverName && serverName.textContent === server.name) {
      item.classList.add('active');
    }
  });
  
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
    console.log('Loading channels for server:', serverId);
    const container = document.getElementById('channelsContainer');
    if (!container) {
      console.error('channelsContainer not found');
      return;
    }
    
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
    console.log('Loaded channels:', channels);
    renderChannels(channels);
    
  } catch (error) {
    console.error('Ошибка загрузки каналов:', error);
    showError('Ошибка загрузки каналов: ' + error.message);
    
    // Показываем сообщение об ошибке
    const container = document.getElementById('channelsContainer');
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
          <h3>Ошибка загрузки каналов</h3>
          <p>${error.message}</p>
        </div>
      `;
    }
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
  console.log('Showing create server modal');
  const modal = document.getElementById('createServerModal');
  if (modal) {
    modal.classList.add('active');
  } else {
    console.error('createServerModal not found');
  }
}

function hideCreateServerModal() {
  console.log('Hiding create server modal');
  const modal = document.getElementById('createServerModal');
  if (modal) {
    modal.classList.remove('active');
  }
  const nameInput = document.getElementById('serverNameInput');
  const descInput = document.getElementById('serverDescriptionInput');
  if (nameInput) nameInput.value = '';
  if (descInput) descInput.value = '';
}

function showJoinServerModal() {
  console.log('Showing join server modal');
  const modal = document.getElementById('joinServerModal');
  if (modal) {
    modal.classList.add('active');
  } else {
    console.error('joinServerModal not found');
  }
}

function hideJoinServerModal() {
  console.log('Hiding join server modal');
  const modal = document.getElementById('joinServerModal');
  if (modal) {
    modal.classList.remove('active');
  }
  const input = document.getElementById('inviteCodeInput');
  if (input) input.value = '';
}

function showCreateChannelModal() {
  console.log('Showing create channel modal');
  if (!currentServer) {
    showError('Выберите сервер');
    return;
  }
  const modal = document.getElementById('createChannelModal');
  if (modal) {
    modal.classList.add('active');
  } else {
    console.error('createChannelModal not found');
  }
}

function hideCreateChannelModal() {
  console.log('Hiding create channel modal');
  const modal = document.getElementById('createChannelModal');
  if (modal) {
    modal.classList.remove('active');
  }
  const input = document.getElementById('channelNameInput');
  if (input) input.value = '';
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

// Глобальные функции для HTML onclick
window.showCreateServerModal = showCreateServerModal;
window.hideCreateServerModal = hideCreateServerModal;
window.showJoinServerModal = showJoinServerModal;
window.hideJoinServerModal = hideJoinServerModal;
window.showCreateChannelModal = showCreateChannelModal;
window.hideCreateChannelModal = hideCreateChannelModal;
window.createServer = createServer;
window.joinServer = joinServer;
window.createChannel = createChannel;
window.joinChannel = joinChannel;
window.toggleMute = toggleMute;
window.leaveVoiceChat = leaveVoiceChat;

// Добавляем обработчики событий после загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
  // Обработчики для модальных окон
  const createServerModal = document.getElementById('createServerModal');
  const joinServerModal = document.getElementById('joinServerModal');
  const createChannelModal = document.getElementById('createChannelModal');
  
  // Закрытие модальных окон по клику вне их
  if (createServerModal) {
    createServerModal.addEventListener('click', function(e) {
      if (e.target === createServerModal) {
        hideCreateServerModal();
      }
    });
  }
  
  if (joinServerModal) {
    joinServerModal.addEventListener('click', function(e) {
      if (e.target === joinServerModal) {
        hideJoinServerModal();
      }
    });
  }
  
  if (createChannelModal) {
    createChannelModal.addEventListener('click', function(e) {
      if (e.target === createChannelModal) {
        hideCreateChannelModal();
      }
    });
  }
  
  // Обработчики для Enter в полях ввода
  const serverNameInput = document.getElementById('serverNameInput');
  const inviteCodeInput = document.getElementById('inviteCodeInput');
  const channelNameInput = document.getElementById('channelNameInput');
  
  if (serverNameInput) {
    serverNameInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        createServer();
      }
    });
  }
  
  if (inviteCodeInput) {
    inviteCodeInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        joinServer();
      }
    });
  }
  
  if (channelNameInput) {
    channelNameInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        createChannel();
      }
    });
  }
});

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, starting initialization...');
  
  // Ждем загрузки всех скриптов
  const checkScripts = () => {
    if (typeof window.Telegram !== 'undefined' || 
        (typeof window.Telegram === 'undefined' && document.readyState === 'complete')) {
      setTimeout(init, 500); // Задержка для полной загрузки
    } else {
      setTimeout(checkScripts, 100);
    }
  };
  
  checkScripts();
});
