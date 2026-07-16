const http = require('node:http');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const { mkdir, readFile, rename, writeFile } = require('node:fs/promises');
const path = require('node:path');

const port = Number(process.env.PORT) || 3000;
const publicDirectory = __dirname;
const dataDirectory = process.env.DATA_DIR || path.join(publicDirectory, '.data');
const dataFile = path.join(dataDirectory, 'mindful-session.json');
const supabaseUrl = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseStateKey = process.env.SUPABASE_STATE_KEY || 'mindful_session_state_v1';
const supabaseConfigured = Boolean(supabaseUrl && supabaseServiceRoleKey);
const adminPassword = process.env.ADMIN_PASSWORD || process.env.PASSWORD || '';
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
let storageStatus = {
  error: null,
  healthy: true,
  lastSyncAt: null,
  provider: supabaseConfigured ? 'supabase' : process.env.DATA_DIR ? 'persistent-volume' : 'local-file',
};
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

async function loadLocalStore() {
  await mkdir(dataDirectory, { recursive: true });

  try {
    const source = await readFile(dataFile, 'utf8');
    return normaliseStore(JSON.parse(source));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Unable to load local application data.', error);
    }
    return null;
  }
}

async function writeLocalSnapshot(snapshot) {
  const temporaryFile = `${dataFile}.${randomBytes(6).toString('hex')}.tmp`;
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(temporaryFile, snapshot, 'utf8');
  await rename(temporaryFile, dataFile);
}

async function supabaseRequest(resource, options = {}) {
  if (!supabaseConfigured) {
    throw new Error('Supabase is not configured.');
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${resource}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      apikey: supabaseServiceRoleKey,
      ...options.headers,
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const error = new Error(`Supabase request failed with status ${response.status}.`);
    error.status = response.status;
    error.detail = detail.slice(0, 300);
    throw error;
  }

  return response;
}

async function loadSupabaseStore() {
  const key = encodeURIComponent(supabaseStateKey);
  const response = await supabaseRequest(`app_settings?select=value&key=eq.${key}&limit=1`, {
    method: 'GET',
  });
  const rows = await response.json();

  if (!rows.length || typeof rows[0].value !== 'string') return null;
  return normaliseStore(JSON.parse(rows[0].value));
}

async function writeSupabaseSnapshot(snapshot) {
  await supabaseRequest('app_settings?on_conflict=key', {
    body: JSON.stringify({
      key: supabaseStateKey,
      updated_at: new Date().toISOString(),
      value: snapshot,
    }),
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    method: 'POST',
  });
}

async function initialiseStore() {
  const localStore = await loadLocalStore();

  if (!supabaseConfigured) {
    store = localStore || createDefaultStore();
    await persistStore();
    return;
  }

  try {
    const remoteStore = await loadSupabaseStore();
    store = remoteStore || localStore || createDefaultStore();
    await persistStore();
  } catch (error) {
    storageStatus = {
      error: error.message,
      healthy: false,
      lastSyncAt: null,
      provider: process.env.DATA_DIR ? 'persistent-volume-fallback' : 'local-file-fallback',
    };
    store = localStore || createDefaultStore();
    await writeLocalSnapshot(JSON.stringify(store, null, 2));
    console.error('Supabase persistence is unavailable; using the local backup.', error.message);
  }
}

function persistStore() {
  const snapshot = JSON.stringify(store, null, 2);

  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    if (supabaseConfigured) {
      try {
        await writeSupabaseSnapshot(snapshot);
        storageStatus = {
          error: null,
          healthy: true,
          lastSyncAt: new Date().toISOString(),
          provider: 'supabase',
        };
      } catch (error) {
        storageStatus = {
          error: error.message,
          healthy: false,
          lastSyncAt: storageStatus.lastSyncAt,
          provider: process.env.DATA_DIR ? 'persistent-volume-fallback' : 'local-file-fallback',
        };
        console.error('Supabase write failed; saved the state to the local backup.', error.message);
      }
    }

    await writeLocalSnapshot(snapshot);
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

function sendDownload(response, filename, contentType, body) {
  const content = Buffer.from(body, 'utf8');
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': content.length,
    'Content-Type': contentType,
  });
  response.end(content);
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
    questionCount: messages.filter((message) => message.role === 'user').length,
    updatedAt: conversation.updatedAt,
    visitorLabel: `匿名訪客 ${conversation.visitorId.slice(-6)}`,
    ...(includeMessages ? { messages } : {}),
  };
}

function hongKongDateKey(value) {
  const parts = new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getActivitySeries(conversations, days = 7) {
  const values = new Map();

  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
    const key = hongKongDateKey(date);
    values.set(key, { conversations: 0, date: key, questions: 0 });
  }

  for (const conversation of conversations) {
    const conversationKey = hongKongDateKey(conversation.createdAt);
    if (values.has(conversationKey)) values.get(conversationKey).conversations++;

    for (const message of conversation.messages || []) {
      if (message.role !== 'user') continue;
      const messageKey = hongKongDateKey(message.createdAt);
      if (values.has(messageKey)) values.get(messageKey).questions++;
    }
  }

  return [...values.values()];
}

function parsePositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function queryConversations(searchParams) {
  const query = String(searchParams.get('q') || '').trim().toLocaleLowerCase('zh-HK').slice(0, 100);
  const period = ['today', '7d', '30d', 'all'].includes(searchParams.get('period'))
    ? searchParams.get('period')
    : 'all';
  const sort = searchParams.get('sort') === 'oldest' ? 'oldest' : 'newest';
  const now = Date.now();
  const currentDay = hongKongDateKey(now);
  const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : null;

  const conversations = store.conversations
    .filter((conversation) => {
      if (period === 'today' && hongKongDateKey(conversation.updatedAt) !== currentDay) return false;
      if (periodDays && new Date(conversation.updatedAt).valueOf() < now - periodDays * 24 * 60 * 60 * 1000) return false;
      if (!query) return true;

      const searchableText = [
        conversation.visitorId,
        `匿名訪客 ${conversation.visitorId.slice(-6)}`,
        ...(conversation.messages || []).map((message) => message.text),
      ].join('\n').toLocaleLowerCase('zh-HK');
      return searchableText.includes(query);
    })
    .sort((left, right) => sort === 'oldest'
      ? left.updatedAt.localeCompare(right.updatedAt)
      : right.updatedAt.localeCompare(left.updatedAt));

  return { conversations, period, query, sort };
}

function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function getOverview() {
  const conversations = [...store.conversations].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const allMessages = conversations.flatMap((conversation) => conversation.messages || []);
  const today = hongKongDateKey(Date.now());

  return {
    activity: getActivitySeries(conversations),
    settings: store.settings,
    stats: {
      activeVisitors: new Set(conversations.map((conversation) => conversation.visitorId)).size,
      averageMessages: conversations.length ? Math.round((allMessages.length / conversations.length) * 10) / 10 : 0,
      conversations: conversations.length,
      lastActivityAt: conversations[0]?.updatedAt || null,
      messages: allMessages.length,
      questionsToday: allMessages.filter((message) => message.role === 'user' && hongKongDateKey(message.createdAt) === today).length,
    },
    system: {
      adminConfigured: Boolean(adminPasswordHash),
      serviceEnabled: store.settings.serviceEnabled,
      storage: storageStatus.provider,
      storageError: storageStatus.error,
      storageHealthy: storageStatus.healthy,
      storageLastSyncAt: storageStatus.lastSyncAt,
      uptimeSeconds: Math.round(process.uptime()),
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

async function handleAdminConversations(request, response, searchParams) {
  if (!requireAdmin(request, response)) return;

  if (request.method === 'DELETE') {
    store.conversations = [];
    await persistStore();
    sendJson(response, 200, { cleared: true });
    return;
  }

  const requestedPage = parsePositiveInteger(searchParams.get('page'), 1, 10000);
  const limit = parsePositiveInteger(searchParams.get('limit'), 12, 50);
  const result = queryConversations(searchParams);
  const pages = Math.max(1, Math.ceil(result.conversations.length / limit));
  const page = Math.min(requestedPage, pages);
  const offset = (page - 1) * limit;

  sendJson(response, 200, {
    conversations: result.conversations
      .slice(offset, offset + limit)
      .map((conversation) => summariseConversation(conversation)),
    pagination: {
      limit,
      page,
      pages,
      total: result.conversations.length,
    },
  });
}

async function handleAdminConversation(request, response, conversationId) {
  if (!requireAdmin(request, response)) return;

  const index = store.conversations.findIndex((conversation) => conversation.id === conversationId);
  if (index === -1) {
    sendError(response, 404, '找不到這段對話。');
    return;
  }

  if (request.method === 'DELETE') {
    store.conversations.splice(index, 1);
    await persistStore();
    sendJson(response, 200, { deleted: true });
    return;
  }

  sendJson(response, 200, {
    conversation: summariseConversation(store.conversations[index], true),
  });
}

async function handleAdminExport(request, response, searchParams) {
  if (!requireAdmin(request, response)) return;

  const format = searchParams.get('format') === 'csv' ? 'csv' : 'json';
  const result = queryConversations(searchParams);
  const date = hongKongDateKey(Date.now());

  if (format === 'json') {
    const body = JSON.stringify({
      conversations: result.conversations.map((conversation) => summariseConversation(conversation, true)),
      exportedAt: new Date().toISOString(),
      filters: { period: result.period, query: result.query, sort: result.sort },
    }, null, 2);
    sendDownload(response, `tszwai-conversations-${date}.json`, 'application/json; charset=utf-8', body);
    return;
  }

  const rows = [[
    'conversation_id',
    'visitor',
    'conversation_created_at',
    'conversation_updated_at',
    'role',
    'message_created_at',
    'message',
  ]];

  for (const conversation of result.conversations) {
    for (const message of conversation.messages || []) {
      rows.push([
        conversation.id,
        `匿名訪客 ${conversation.visitorId.slice(-6)}`,
        conversation.createdAt,
        conversation.updatedAt,
        message.role,
        message.createdAt,
        message.text,
      ]);
    }
  }

  const body = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')}`;
  sendDownload(response, `tszwai-conversations-${date}.csv`, 'text/csv; charset=utf-8', body);
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
  const requestUrl = new URL(request.url || '/', 'http://localhost');
  const { pathname, searchParams } = requestUrl;

  try {
    if (pathname === '/health' && request.method === 'GET') {
      sendJson(response, 200, {
        status: storageStatus.healthy ? 'ok' : 'degraded',
        storage: {
          healthy: storageStatus.healthy,
          provider: storageStatus.provider,
        },
        uptime: Math.round(process.uptime()),
      });
      return;
    }
    if (pathname === '/api/public/config' && request.method === 'GET') return await handlePublicConfig(response);
    if (pathname === '/api/chat' && request.method === 'POST') return await handleChat(request, response);
    if (pathname === '/api/admin/login' && request.method === 'POST') return await handleAdminLogin(request, response);
    if (pathname === '/api/admin/logout' && request.method === 'POST') return await handleAdminLogout(request, response);
    if (pathname === '/api/admin/session' && request.method === 'GET') return await handleAdminSession(request, response);
    if (pathname === '/api/admin/overview' && request.method === 'GET') return await handleAdminOverview(request, response);
    if (pathname === '/api/admin/conversations' && ['DELETE', 'GET'].includes(request.method)) return await handleAdminConversations(request, response, searchParams);
    if (pathname === '/api/admin/export' && request.method === 'GET') return await handleAdminExport(request, response, searchParams);
    if (pathname === '/api/admin/settings' && request.method === 'PATCH') return await handleAdminSettings(request, response);

    const conversationMatch = pathname.match(/^\/api\/admin\/conversations\/([A-Za-z0-9_-]+)$/);
    if (conversationMatch && ['DELETE', 'GET'].includes(request.method)) {
      return await handleAdminConversation(request, response, conversationMatch[1]);
    }

    return await serveStatic(request, response, pathname);
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