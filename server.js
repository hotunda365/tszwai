const http = require('node:http');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const { mkdir, readFile, rename, writeFile } = require('node:fs/promises');
const path = require('node:path');

const port = Number(process.env.PORT) || 3000;
const publicDirectory = __dirname;
const dataDirectory = process.env.DATA_DIR || path.join(publicDirectory, '.data');
const dataFile = path.join(dataDirectory, 'mindful-session.json');
const adminPassword = process.env.ADMIN_PASSWORD || '';
const adminPasswordHash = adminPassword
  ? createHash('sha256').update(adminPassword, 'utf8').digest()
  : null;
const sessionDurationMs = 12 * 60 * 60 * 1000;
const maxRequestSize = 64 * 1024;
const maxConversations = 200;
const maxMessagesPerConversation = 100;

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const staticFiles = new Set([
  'admin-client.js',
  'admin.css',
  'admin.html',
  'app-client.js',
  'index.html',
  'style.css',
]);

const defaultSettings = Object.freeze({
  assistantName: '心靈導師',
  welcomeMessage: '你好，我在這裡陪你。你可以慢慢說，今天最想被理解的是哪一部分？',
  guestQuestionLimit: 5,
  replyStyle: 'supportive',
  serviceEnabled: true,
});

const replyTemplates = {
  grounding: [
    '謝謝你告訴我這些。先不用急著找答案，試著讓雙腳輕輕接觸地面，慢慢吸一口氣。此刻，你的身體最需要什麼？',
    '我聽見了。先把注意力帶回當下：看看身邊三樣看得見的東西，再讓呼吸慢一點。你願意說說哪一部分最讓你不安嗎？',
  ],
  reflective: [
    '謝謝你願意把這份感受放在這裡。從你的話裡，我聽見了很多正在努力承受的部分。對你來說，最想被理解的是哪一個片段？',
    '這個感受似乎陪了你一段時間。你不需要立刻處理好它；我們可以一起靠近它一點點。它最常在什麼時候出現？',
  ],
  supportive: [
    '謝謝你願意分享這些。我在這裡，會慢慢聽你說。你現在最希望有人理解的是哪一部分？',
    '你有這樣的感受，是可以被理解的。先不用急著改變什麼；此刻有沒有一件能讓你感到一點點安穩的小事？',
  ],
};

let store = createDefaultStore();
let writeQueue = Promise.resolve();
const sessions = new Map();
const loginAttempts = new Map();

function createDefaultStore() {
  return {
    conversations: [],
    settings: { ...defaultSettings },
    version: 1,
  };
}

function normaliseSettings(candidate) {
  const settings = { ...defaultSettings };

  if (!candidate || typeof candidate !== 'object') {
    return settings;
  }

  if (typeof candidate.assistantName === 'string' && candidate.assistantName.trim()) {
    settings.assistantName = candidate.assistantName.trim().slice(0, 48);
  }
  if (typeof candidate.welcomeMessage === 'string' && candidate.welcomeMessage.trim()) {
    settings.welcomeMessage = candidate.welcomeMessage.trim().slice(0, 500);
  }
  if (Number.isInteger(candidate.guestQuestionLimit)) {
    settings.guestQuestionLimit = Math.min(20, Math.max(1, candidate.guestQuestionLimit));
  }
  if (['grounding', 'reflective', 'supportive'].includes(candidate.replyStyle)) {
    settings.replyStyle = candidate.replyStyle;
  }
  if (typeof candidate.serviceEnabled === 'boolean') {
    settings.serviceEnabled = candidate.serviceEnabled;
  }

  return settings;
}

function normaliseStore(candidate) {
  const normalised = createDefaultStore();
  normalised.settings = normaliseSettings(candidate?.settings);

  if (!Array.isArray(candidate?.conversations)) {
    return normalised;
  }

  normalised.conversations = candidate.conversations
    .filter((conversation) => conversation && typeof conversation === 'object')
    .map((conversation) => ({
      createdAt: typeof conversation.createdAt === 'string' ? conversation.createdAt : new Date().toISOString(),
      id: typeof conversation.id === 'string' ? conversation.id : randomId(),
      messages: Array.isArray(conversation.messages)
        ? conversation.messages
          .filter((message) => message && typeof message.text === 'string' && ['assistant', 'user'].includes(message.role))
          .slice(-maxMessagesPerConversation)
          .map((message) => ({
            createdAt: typeof message.createdAt === 'string' ? message.createdAt : new Date().toISOString(),
            id: typeof message.id === 'string' ? message.id : randomId(),
            role: message.role,
            text: message.text.slice(0, 1200),
          }))
        : [],
      updatedAt: typeof conversation.updatedAt === 'string' ? conversation.updatedAt : new Date().toISOString(),
      visitorId: typeof conversation.visitorId === 'string' ? conversation.visitorId.slice(0, 80) : randomId(),
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, maxConversations);

  return normalised;
}

async function initialiseStore() {
  await mkdir(dataDirectory, { recursive: true });

  try {
    const source = await readFile(dataFile, 'utf8');
    store = normaliseStore(JSON.parse(source));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Unable to load application data. Starting with a clean store.', error);
    }
    await persistStore();
  }
}

function persistStore() {
  const snapshot = JSON.stringify(store, null, 2);
  const temporaryFile = `${dataFile}.${randomBytes(6).toString('hex')}.tmp`;

  writeQueue = writeQueue.then(async () => {
    await writeFile(temporaryFile, snapshot, 'utf8');
    await rename(temporaryFile, dataFile);
  });

  return writeQueue;
}

function randomId() {
  return randomBytes(18).toString('base64url');
}

function setSecurityHeaders(response) {
  response.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; base-uri 'self'; frame-ancestors 'none'");
  response.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(body);
}

function sendError(response, status, message) {
  sendJson(response, status, { error: message });
}

function readCookies(request) {
  return Object.fromEntries(
    (request.headers.cookie || '')
      .split(';')
      .map((item) => item.trim().split('='))
      .filter(([name, value]) => name && value)
      .map(([name, ...value]) => [name, decodeURIComponent(value.join('='))]),
  );
}

function currentSession(request) {
  const token = readCookies(request).admin_session;
  const session = token ? sessions.get(token) : null;

  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }

  return { ...session, token };
}

function isSecureRequest(request) {
  const protocol = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return protocol === 'https' || process.env.NODE_ENV === 'production';
}

function setAdminSessionCookie(request, response, token, expiresAt) {
  const attributes = [
    `admin_session=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    `Max-Age=${Math.floor((expiresAt - Date.now()) / 1000)}`,
  ];

  if (isSecureRequest(request)) attributes.push('Secure');
  response.setHeader('Set-Cookie', attributes.join('; '));
}

function clearAdminSessionCookie(request, response) {
  const attributes = ['admin_session=', 'HttpOnly', 'Path=/', 'SameSite=Strict', 'Max-Age=0'];
  if (isSecureRequest(request)) attributes.push('Secure');
  response.setHeader('Set-Cookie', attributes.join('; '));
}

async function readJsonBody(request) {
  let size = 0;
  const chunks = [];

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxRequestSize) {
      const error = new Error('Request body is too large.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.status = 400;
    throw error;
  }
}

function requestAddress(request) {
  return String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
}

function isLoginLocked(request) {
  const address = requestAddress(request);
  const attempt = loginAttempts.get(address);

  if (!attempt || attempt.resetAt <= Date.now()) {
    loginAttempts.delete(address);
    return false;
  }

  return attempt.count >= 5;
}

function recordLoginFailure(request) {
  const address = requestAddress(request);
  const current = loginAttempts.get(address);
  const resetAt = Date.now() + 15 * 60 * 1000;
  loginAttempts.set(address, {
    count: (current?.resetAt > Date.now() ? current.count : 0) + 1,
    resetAt,
  });
}

function passwordMatches(candidate) {
  if (!adminPasswordHash || typeof candidate !== 'string') return false;
  const candidateHash = createHash('sha256').update(candidate, 'utf8').digest();
  return timingSafeEqual(adminPasswordHash, candidateHash);
}

function requireAdmin(request, response) {
  const session = currentSession(request);
  if (!session) {
    sendError(response, 401, '請先登入管理後台。');
    return null;
  }
  return session;
}

function summariseConversation(conversation, includeMessages = false) {
  const messages = conversation.messages || [];
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user');

  return {
    createdAt: conversation.createdAt,
    id: conversation.id,
    messageCount: messages.length,
    preview: latestUserMessage?.text.slice(0, 100) || '尚未有訊息',
    updatedAt: conversation.updatedAt,
    visitorLabel: `匿名訪客 ${conversation.visitorId.slice(-6)}`,
    ...(includeMessages ? { messages } : {}),
  };
}

function getOverview() {
  const conversations = [...store.conversations].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const allMessages = conversations.flatMap((conversation) => conversation.messages || []);
  const today = new Date().toISOString().slice(0, 10);

  return {
    recentConversations: conversations.slice(0, 8).map((conversation) => summariseConversation(conversation)),
    settings: store.settings,
    stats: {
      activeVisitors: new Set(conversations.map((conversation) => conversation.visitorId)).size,
      conversations: conversations.length,
      messages: allMessages.length,
      questionsToday: allMessages.filter((message) => message.role === 'user' && message.createdAt.startsWith(today)).length,
    },
  };
}

function createAssistantReply(style) {
  const templates = replyTemplates[style] || replyTemplates.supportive;
  return templates[Math.floor(Math.random() * templates.length)];
}

function validateSettings(payload) {
  if (!payload || typeof payload !== 'object') {
    return { error: '設定格式不正確。' };
  }

  const assistantName = typeof payload.assistantName === 'string' ? payload.assistantName.trim() : '';
  const welcomeMessage = typeof payload.welcomeMessage === 'string' ? payload.welcomeMessage.trim() : '';

  if (!assistantName || assistantName.length > 48) {
    return { error: '導師名稱必須介乎 1 至 48 個字元。' };
  }
  if (!welcomeMessage || welcomeMessage.length > 500) {
    return { error: '歡迎訊息必須介乎 1 至 500 個字元。' };
  }
  if (!Number.isInteger(payload.guestQuestionLimit) || payload.guestQuestionLimit < 1 || payload.guestQuestionLimit > 20) {
    return { error: '訪客提問上限必須是 1 至 20。' };
  }
  if (!['grounding', 'reflective', 'supportive'].includes(payload.replyStyle)) {
    return { error: '請選擇有效的回覆語氣。' };
  }
  if (typeof payload.serviceEnabled !== 'boolean') {
    return { error: '服務狀態格式不正確。' };
  }

  return {
    settings: {
      assistantName,
      guestQuestionLimit: payload.guestQuestionLimit,
      replyStyle: payload.replyStyle,
      serviceEnabled: payload.serviceEnabled,
      welcomeMessage,
    },
  };
}

async function handlePublicConfig(response) {
  sendJson(response, 200, { settings: store.settings });
}

async function handleChat(request, response) {
  if (!store.settings.serviceEnabled) {
    sendError(response, 503, '心靈導師暫時休息中，請稍後再回來。');
    return;
  }

  const payload = await readJsonBody(request);
  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  const visitorId = typeof payload.visitorId === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(payload.visitorId)
    ? payload.visitorId
    : null;

  if (!message || message.length > 1200 || !visitorId) {
    sendError(response, 400, '訊息或訪客識別資料不正確。');
    return;
  }

  let conversation = store.conversations.find((item) => item.visitorId === visitorId);
  const now = new Date().toISOString();

  if (!conversation) {
    conversation = {
      createdAt: now,
      id: randomId(),
      messages: [],
      updatedAt: now,
      visitorId,
    };
    store.conversations.unshift(conversation);
  }

  const guestQuestions = conversation.messages.filter((item) => item.role === 'user').length;
  if (guestQuestions >= store.settings.guestQuestionLimit) {
    sendJson(response, 429, {
      error: '訪客提問次數已用完。',
      remaining: 0,
    });
    return;
  }

  const reply = createAssistantReply(store.settings.replyStyle);
  conversation.messages.push(
    { createdAt: now, id: randomId(), role: 'user', text: message },
    { createdAt: now, id: randomId(), role: 'assistant', text: reply },
  );
  conversation.messages = conversation.messages.slice(-maxMessagesPerConversation);
  conversation.updatedAt = now;
  store.conversations = store.conversations
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, maxConversations);
  await persistStore();

  sendJson(response, 200, {
    remaining: Math.max(0, store.settings.guestQuestionLimit - guestQuestions - 1),
    reply,
  });
}

async function handleAdminLogin(request, response) {
  if (!adminPasswordHash) {
    sendError(response, 503, '尚未設定 ADMIN_PASSWORD，管理後台目前未啟用。');
    return;
  }
  if (isLoginLocked(request)) {
    sendError(response, 429, '嘗試次數過多，請十五分鐘後再試。');
    return;
  }

  const payload = await readJsonBody(request);
  if (!passwordMatches(payload.password)) {
    recordLoginFailure(request);
    sendError(response, 401, '密碼不正確。');
    return;
  }

  loginAttempts.delete(requestAddress(request));
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + sessionDurationMs;
  sessions.set(token, { expiresAt });
  setAdminSessionCookie(request, response, token, expiresAt);
  sendJson(response, 200, { authenticated: true });
}

async function handleAdminSession(request, response) {
  sendJson(response, 200, {
    authenticated: Boolean(currentSession(request)),
    configured: Boolean(adminPasswordHash),
  });
}

async function handleAdminLogout(request, response) {
  const session = currentSession(request);
  if (session) sessions.delete(session.token);
  clearAdminSessionCookie(request, response);
  sendJson(response, 200, { authenticated: false });
}

async function handleAdminOverview(request, response) {
  if (!requireAdmin(request, response)) return;
  sendJson(response, 200, getOverview());
}

async function handleAdminConversations(request, response) {
  if (!requireAdmin(request, response)) return;

  if (request.method === 'DELETE') {
    store.conversations = [];
    await persistStore();
    sendJson(response, 200, { cleared: true });
    return;
  }

  sendJson(response, 200, {
    conversations: [...store.conversations]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 50)
      .map((conversation) => summariseConversation(conversation, true)),
  });
}

async function handleAdminSettings(request, response) {
  if (!requireAdmin(request, response)) return;

  const payload = await readJsonBody(request);
  const result = validateSettings(payload);
  if (result.error) {
    sendError(response, 400, result.error);
    return;
  }

  store.settings = result.settings;
  await persistStore();
  sendJson(response, 200, { settings: store.settings });
}

async function serveStatic(request, response, pathname) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  const requestedFile = pathname === '/' ? 'index.html' : pathname === '/admin' || pathname === '/admin/' ? 'admin.html' : pathname.slice(1);
  if (!staticFiles.has(requestedFile)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  try {
    const filePath = path.join(publicDirectory, requestedFile);
    const body = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();

    response.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Length': body.length,
      'Content-Type': contentTypes[extension] || 'application/octet-stream',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Internal server error');
  }
}

async function routeRequest(request, response) {
  setSecurityHeaders(response);
  const { pathname } = new URL(request.url || '/', 'http://localhost');

  try {
    if (pathname === '/health' && request.method === 'GET') {
      sendJson(response, 200, { status: 'ok', uptime: Math.round(process.uptime()) });
      return;
    }
    if (pathname === '/api/public/config' && request.method === 'GET') return handlePublicConfig(response);
    if (pathname === '/api/chat' && request.method === 'POST') return handleChat(request, response);
    if (pathname === '/api/admin/login' && request.method === 'POST') return handleAdminLogin(request, response);
    if (pathname === '/api/admin/logout' && request.method === 'POST') return handleAdminLogout(request, response);
    if (pathname === '/api/admin/session' && request.method === 'GET') return handleAdminSession(request, response);
    if (pathname === '/api/admin/overview' && request.method === 'GET') return handleAdminOverview(request, response);
    if (pathname === '/api/admin/conversations' && ['DELETE', 'GET'].includes(request.method)) return handleAdminConversations(request, response);
    if (pathname === '/api/admin/settings' && request.method === 'PATCH') return handleAdminSettings(request, response);

    return serveStatic(request, response, pathname);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      sendError(response, error.status || 500, error.status ? error.message : '伺服器暫時無法處理請求。');
    } else {
      response.end();
    }
  }
}

const server = http.createServer(routeRequest);

initialiseStore()
  .then(() => {
    server.listen(port, '0.0.0.0', () => {
      console.log(`Mindful Session is listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error('Unable to start Mindful Session.', error);
    process.exitCode = 1;
  });