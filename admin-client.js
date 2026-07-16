const loginView = document.getElementById('login-view');
const setupView = document.getElementById('setup-view');
const dashboardView = document.getElementById('dashboard-view');
const loginForm = document.getElementById('login-form');
const loginPassword = document.getElementById('admin-password');
const settingsForm = document.getElementById('settings-form');
const refreshButton = document.getElementById('refresh-button');
const logoutButton = document.getElementById('logout-button');
const clearConversationsButton = document.getElementById('clear-conversations-button');
const toast = document.getElementById('toast');
const dashboardStatus = document.getElementById('dashboard-status');
const conversationList = document.getElementById('conversation-list');

const metricVisitors = document.getElementById('metric-visitors');
const metricConversations = document.getElementById('metric-conversations');
const metricMessages = document.getElementById('metric-messages');
const metricToday = document.getElementById('metric-today');

const assistantName = document.getElementById('assistant-name');
const welcomeMessage = document.getElementById('welcome-message');
const replyStyle = document.getElementById('reply-style');
const guestLimit = document.getElementById('guest-limit');
const serviceEnabled = document.getElementById('service-enabled');
const saveSettingsButton = document.getElementById('save-settings-button');

let toastTimeout;

async function requestApi(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || '目前無法完成此操作。');
    error.status = response.status;
    throw error;
  }

  return payload;
}

function setView(view) {
  setupView.hidden = view !== 'setup';
  loginView.hidden = view !== 'login';
  dashboardView.hidden = view !== 'dashboard';
}

function setDashboardStatus(message) {
  dashboardStatus.textContent = message;
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.hidden = false;
  toastTimeout = window.setTimeout(() => {
    toast.hidden = true;
  }, 3800);
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '未知時間';

  return new Intl.DateTimeFormat('zh-HK', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(date);
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderConversations(conversations) {
  conversationList.replaceChildren();

  if (!conversations.length) {
    conversationList.append(createElement('p', 'empty-state', '尚未有匿名對話紀錄。'));
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const conversation of conversations) {
    const row = createElement('article', 'conversation-row');
    const main = createElement('div', 'conversation-main');
    main.append(
      createElement('strong', '', conversation.visitorLabel),
      createElement('time', '', formatTime(conversation.updatedAt)),
    );

    const preview = createElement('p', 'conversation-preview', conversation.preview);
    const meta = createElement('div', 'conversation-meta');
    meta.append(createElement('span', '', `${conversation.messageCount} 則訊息`));

    row.append(main, preview, meta);

    if (conversation.messages?.length) {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = '查看完整對話';
      const transcript = createElement('div', 'conversation-transcript');

      for (const message of conversation.messages) {
        const item = createElement('p', 'conversation-message');
        const role = createElement('strong', '', message.role === 'assistant' ? '導師' : '訪客');
        const time = createElement('time', '', ` · ${formatTime(message.createdAt)}`);
        item.append(role, time, document.createTextNode(`：${message.text}`));
        transcript.append(item);
      }

      details.append(summary, transcript);
      row.append(details);
    }

    fragment.append(row);
  }

  conversationList.append(fragment);
}

function renderSettings(settings) {
  assistantName.value = settings.assistantName;
  welcomeMessage.value = settings.welcomeMessage;
  replyStyle.value = settings.replyStyle;
  guestLimit.value = settings.guestQuestionLimit;
  serviceEnabled.checked = settings.serviceEnabled;
}

function renderDashboard(overview, conversations) {
  metricVisitors.textContent = overview.stats.activeVisitors;
  metricConversations.textContent = overview.stats.conversations;
  metricMessages.textContent = overview.stats.messages;
  metricToday.textContent = overview.stats.questionsToday;
  renderSettings(overview.settings);
  renderConversations(conversations);
  setDashboardStatus(`最後更新：${new Intl.DateTimeFormat('zh-HK', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`);
}

async function loadDashboard() {
  setDashboardStatus('正在更新資料');
  const [overview, conversationData] = await Promise.all([
    requestApi('/api/admin/overview'),
    requestApi('/api/admin/conversations'),
  ]);
  renderDashboard(overview, conversationData.conversations);
}

async function refreshDashboard() {
  refreshButton.disabled = true;
  try {
    await loadDashboard();
  } catch (error) {
    if (error.status === 401) {
      setView('login');
      showToast('登入狀態已失效，請重新登入。', true);
      return;
    }
    setDashboardStatus('無法更新資料');
    showToast(error.message, true);
  } finally {
    refreshButton.disabled = false;
  }
}

async function initialise() {
  try {
    const session = await requestApi('/api/admin/session');
    if (!session.configured) {
      setView('setup');
      return;
    }
    if (!session.authenticated) {
      setView('login');
      return;
    }

    setView('dashboard');
    await loadDashboard();
  } catch (error) {
    setView('login');
    showToast(error.message, true);
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  try {
    await requestApi('/api/admin/login', {
      body: JSON.stringify({ password: loginPassword.value }),
      method: 'POST',
    });
    loginPassword.value = '';
    setView('dashboard');
    await loadDashboard();
    showToast('已登入管理後台。');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  saveSettingsButton.disabled = true;

  try {
    const payload = {
      assistantName: assistantName.value,
      guestQuestionLimit: Number(guestLimit.value),
      replyStyle: replyStyle.value,
      serviceEnabled: serviceEnabled.checked,
      welcomeMessage: welcomeMessage.value,
    };
    const response = await requestApi('/api/admin/settings', {
      body: JSON.stringify(payload),
      method: 'PATCH',
    });
    renderSettings(response.settings);
    showToast('設定已儲存。');
    await refreshDashboard();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    saveSettingsButton.disabled = false;
  }
});

clearConversationsButton.addEventListener('click', async () => {
  if (!window.confirm('確定要永久清除所有匿名對話紀錄？')) return;

  clearConversationsButton.disabled = true;
  try {
    await requestApi('/api/admin/conversations', { method: 'DELETE' });
    await refreshDashboard();
    showToast('匿名對話紀錄已清除。');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    clearConversationsButton.disabled = false;
  }
});

logoutButton.addEventListener('click', async () => {
  try {
    await requestApi('/api/admin/logout', { method: 'POST' });
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setView('login');
    loginPassword.focus();
  }
});

refreshButton.addEventListener('click', refreshDashboard);

initialise();
