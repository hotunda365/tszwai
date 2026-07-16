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
const conversationResultCount = document.getElementById('conversation-result-count');
const conversationSearch = document.getElementById('conversation-search');
const conversationPeriod = document.getElementById('conversation-period');
const conversationSort = document.getElementById('conversation-sort');
const resetFiltersButton = document.getElementById('reset-filters-button');
const conversationPagination = document.getElementById('conversation-pagination');
const previousPageButton = document.getElementById('previous-page-button');
const nextPageButton = document.getElementById('next-page-button');
const paginationLabel = document.getElementById('pagination-label');
const exportJsonButton = document.getElementById('export-json-button');
const exportCsvButton = document.getElementById('export-csv-button');

const metricVisitors = document.getElementById('metric-visitors');
const metricConversations = document.getElementById('metric-conversations');
const metricMessages = document.getElementById('metric-messages');
const metricToday = document.getElementById('metric-today');
const metricAverage = document.getElementById('metric-average');
const activityChart = document.getElementById('activity-chart');
const serviceBadge = document.getElementById('service-badge');
const sidebarStatusDot = document.getElementById('sidebar-status-dot');
const sidebarServiceLabel = document.getElementById('sidebar-service-label');
const systemService = document.getElementById('system-service');
const systemStorage = document.getElementById('system-storage');
const systemUptime = document.getElementById('system-uptime');
const systemLastActivity = document.getElementById('system-last-activity');

const assistantName = document.getElementById('assistant-name');
const welcomeMessage = document.getElementById('welcome-message');
const replyStyle = document.getElementById('reply-style');
const guestLimit = document.getElementById('guest-limit');
const serviceEnabled = document.getElementById('service-enabled');
const saveSettingsButton = document.getElementById('save-settings-button');
const resetSettingsButton = document.getElementById('reset-settings-button');
const settingsSaveState = document.getElementById('settings-save-state');

const conversationDialog = document.getElementById('conversation-dialog');
const conversationDialogTitle = document.getElementById('conversation-dialog-title');
const conversationDialogMeta = document.getElementById('conversation-dialog-meta');
const conversationDialogContent = document.getElementById('conversation-dialog-content');
const closeConversationDialog = document.getElementById('close-conversation-dialog');
const closeConversationButton = document.getElementById('close-conversation-button');
const deleteConversationButton = document.getElementById('delete-conversation-button');

const conversationState = {
  limit: 10,
  page: 1,
  pages: 1,
  period: 'all',
  query: '',
  selectedId: null,
  sort: 'newest',
  total: 0,
};

let savedSettings = null;
let searchTimeout;
let toastTimeout;

async function requestApi(path, options = {}) {
  const { headers = {}, ...requestOptions } = options;
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...requestOptions,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
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
  if (!value) return '尚未有活動';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '未知時間';

  return new Intl.DateTimeFormat('zh-HK', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(date);
}

function formatChartDate(value) {
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat('zh-HK', { day: 'numeric', month: 'numeric' }).format(date);
}

function formatUptime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);

  if (days) return `${days} 日 ${hours} 小時`;
  if (hours) return `${hours} 小時 ${minutes} 分鐘`;
  return `${minutes} 分鐘`;
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function buildConversationParams(includePagination = true) {
  const params = new URLSearchParams({
    period: conversationState.period,
    q: conversationState.query,
    sort: conversationState.sort,
  });

  if (includePagination) {
    params.set('limit', conversationState.limit);
    params.set('page', conversationState.page);
  }

  return params;
}

function renderActivity(activity) {
  activityChart.replaceChildren();
  const values = Array.isArray(activity) ? activity : [];
  const maximum = Math.max(1, ...values.flatMap((day) => [day.questions, day.conversations]));
  const fragment = document.createDocumentFragment();

  for (const day of values) {
    const item = createElement('div', 'activity-day');
    const bars = createElement('div', 'activity-bars');
    const questionBar = createElement('span', 'activity-bar questions');
    const conversationBar = createElement('span', 'activity-bar conversations');
    questionBar.style.height = `${Math.max(day.questions ? 6 : 2, (day.questions / maximum) * 100)}%`;
    conversationBar.style.height = `${Math.max(day.conversations ? 6 : 2, (day.conversations / maximum) * 100)}%`;
    questionBar.title = `${day.questions} 個提問`;
    conversationBar.title = `${day.conversations} 段新對話`;
    bars.setAttribute('aria-label', `${formatChartDate(day.date)}：${day.questions} 個提問，${day.conversations} 段新對話`);
    bars.append(questionBar, conversationBar);
    item.append(bars, createElement('span', 'activity-day-label', formatChartDate(day.date)));
    fragment.append(item);
  }

  activityChart.append(fragment);
}

function renderSystem(system, stats) {
  const enabled = Boolean(system.serviceEnabled);
  const serviceText = enabled ? '服務正常開放' : '服務已暫停';
  const stateClass = enabled ? 'online' : 'paused';
  const storageLabels = {
    'local-file': '容器本機檔案',
    'local-file-fallback': '本機備份（Supabase 異常）',
    'persistent-volume': '持久化 Volume',
    'persistent-volume-fallback': 'Volume 備份（Supabase 異常）',
    supabase: 'Supabase 已同步',
  };

  serviceBadge.textContent = serviceText;
  serviceBadge.classList.remove('online', 'paused');
  serviceBadge.classList.add(stateClass);
  sidebarStatusDot.classList.remove('online', 'paused');
  sidebarStatusDot.classList.add(stateClass);
  sidebarServiceLabel.textContent = enabled ? 'ONLINE' : 'PAUSED';
  systemService.textContent = enabled ? '正常開放' : '已暫停';
  systemStorage.textContent = storageLabels[system.storage] || system.storage;
  systemStorage.title = system.storageError || (system.storage === 'supabase'
    ? `最後同步：${formatTime(system.storageLastSyncAt)}`
    : '重新部署可能會清除本機資料，建議使用 Supabase 或掛載 Zeabur Volume。');
  systemStorage.classList.toggle('system-warning', !system.storageHealthy);
  systemUptime.textContent = formatUptime(system.uptimeSeconds);
  systemLastActivity.textContent = formatTime(stats.lastActivityAt);
}

function renderOverview(overview) {
  metricVisitors.textContent = overview.stats.activeVisitors;
  metricConversations.textContent = overview.stats.conversations;
  metricMessages.textContent = overview.stats.messages;
  metricToday.textContent = overview.stats.questionsToday;
  metricAverage.textContent = `平均 ${overview.stats.averageMessages} 則 / 對話`;
  renderActivity(overview.activity);
  renderSystem(overview.system, overview.stats);
  renderSettings(overview.settings);
}

function renderConversations(conversations, pagination) {
  conversationList.replaceChildren();
  conversationState.page = pagination.page;
  conversationState.pages = pagination.pages;
  conversationState.total = pagination.total;
  conversationResultCount.textContent = `找到 ${pagination.total} 段對話`;
  resetFiltersButton.hidden = !conversationState.query && conversationState.period === 'all' && conversationState.sort === 'newest';

  if (!conversations.length) {
    conversationList.append(createElement('p', 'empty-state', '沒有符合條件的匿名對話。'));
  } else {
    const fragment = document.createDocumentFragment();

    for (const conversation of conversations) {
      const row = createElement('article', 'conversation-row');
      const openButton = createElement('button', 'conversation-open');
      openButton.type = 'button';
      openButton.dataset.conversationId = conversation.id;
      openButton.setAttribute('aria-label', `查看 ${conversation.visitorLabel} 的對話詳情`);

      const copy = createElement('div', 'conversation-copy');
      const main = createElement('div', 'conversation-main');
      main.append(
        createElement('strong', '', conversation.visitorLabel),
        createElement('time', '', formatTime(conversation.updatedAt)),
      );
      const preview = createElement('p', 'conversation-preview', conversation.preview);
      const meta = createElement('div', 'conversation-meta');
      meta.append(
        createElement('span', '', `${conversation.questionCount} 個提問`),
        createElement('span', '', `${conversation.messageCount} 則訊息`),
      );
      copy.append(main, preview, meta);
      openButton.append(copy, createElement('span', 'conversation-arrow', '›'));
      row.append(openButton);
      fragment.append(row);
    }

    conversationList.append(fragment);
  }

  conversationPagination.hidden = pagination.pages <= 1;
  paginationLabel.textContent = `第 ${pagination.page} / ${pagination.pages} 頁`;
  previousPageButton.disabled = pagination.page <= 1;
  nextPageButton.disabled = pagination.page >= pagination.pages;
}

function getSettingsPayload() {
  return {
    assistantName: assistantName.value.trim(),
    guestQuestionLimit: Number(guestLimit.value),
    replyStyle: replyStyle.value,
    serviceEnabled: serviceEnabled.checked,
    welcomeMessage: welcomeMessage.value.trim(),
  };
}

function settingsAreDirty() {
  return savedSettings && JSON.stringify(getSettingsPayload()) !== JSON.stringify(savedSettings);
}

function updateSettingsSaveState() {
  const dirty = settingsAreDirty();
  settingsSaveState.textContent = dirty ? '有未儲存變更' : '所有變更已儲存';
  settingsSaveState.classList.toggle('dirty', dirty);
  resetSettingsButton.disabled = !dirty;
}

function renderSettings(settings) {
  savedSettings = {
    assistantName: settings.assistantName,
    guestQuestionLimit: settings.guestQuestionLimit,
    replyStyle: settings.replyStyle,
    serviceEnabled: settings.serviceEnabled,
    welcomeMessage: settings.welcomeMessage,
  };
  assistantName.value = savedSettings.assistantName;
  welcomeMessage.value = savedSettings.welcomeMessage;
  replyStyle.value = savedSettings.replyStyle;
  guestLimit.value = savedSettings.guestQuestionLimit;
  serviceEnabled.checked = savedSettings.serviceEnabled;
  updateSettingsSaveState();
}

function renderConversationDetail(conversation) {
  conversationDialogTitle.textContent = conversation.visitorLabel;
  conversationDialogMeta.textContent = `${conversation.questionCount} 個提問 · ${conversation.messageCount} 則訊息 · 最後活動 ${formatTime(conversation.updatedAt)}`;
  conversationDialogContent.replaceChildren();

  const fragment = document.createDocumentFragment();
  for (const message of conversation.messages) {
    const record = createElement('article', `message-record ${message.role}`);
    const header = document.createElement('header');
    header.append(
      createElement('strong', '', message.role === 'assistant' ? '導師' : '訪客'),
      createElement('time', '', formatTime(message.createdAt)),
    );
    record.append(header, createElement('p', '', message.text));
    fragment.append(record);
  }
  conversationDialogContent.append(fragment);
}

async function loadConversations() {
  conversationList.setAttribute('aria-busy', 'true');
  conversationResultCount.textContent = '正在讀取對話';

  try {
    const payload = await requestApi(`/api/admin/conversations?${buildConversationParams()}`);
    renderConversations(payload.conversations, payload.pagination);
  } finally {
    conversationList.removeAttribute('aria-busy');
  }
}

async function loadDashboard() {
  setDashboardStatus('正在更新資料');
  const [overview] = await Promise.all([
    requestApi('/api/admin/overview'),
    loadConversations(),
  ]);
  renderOverview(overview);
  setDashboardStatus(`最後更新：${new Intl.DateTimeFormat('zh-HK', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`);
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

async function applyConversationFilters() {
  conversationState.page = 1;
  try {
    await loadConversations();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function openConversation(conversationId) {
  conversationState.selectedId = conversationId;
  conversationDialogTitle.textContent = '正在讀取對話';
  conversationDialogMeta.textContent = '';
  conversationDialogContent.replaceChildren(createElement('p', 'dialog-loading', '正在載入完整對話…'));
  deleteConversationButton.disabled = true;
  if (!conversationDialog.open) conversationDialog.showModal();

  try {
    const payload = await requestApi(`/api/admin/conversations/${encodeURIComponent(conversationId)}`);
    renderConversationDetail(payload.conversation);
    deleteConversationButton.disabled = false;
  } catch (error) {
    conversationDialogContent.replaceChildren(createElement('p', 'dialog-loading', error.message));
    showToast(error.message, true);
  }
}

function closeDialog() {
  conversationDialog.close();
  conversationState.selectedId = null;
}

function startExport(format) {
  const params = buildConversationParams(false);
  params.set('format', format);
  const link = document.createElement('a');
  link.href = `/api/admin/export?${params}`;
  link.download = '';
  document.body.append(link);
  link.click();
  link.remove();
  showToast(`正在準備 ${format.toUpperCase()} 匯出檔。`);
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
    const response = await requestApi('/api/admin/settings', {
      body: JSON.stringify(getSettingsPayload()),
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

settingsForm.addEventListener('input', updateSettingsSaveState);
settingsForm.addEventListener('change', updateSettingsSaveState);

resetSettingsButton.addEventListener('click', () => {
  if (!savedSettings) return;
  renderSettings(savedSettings);
  showToast('已還原未儲存變更。');
});

conversationSearch.addEventListener('input', () => {
  conversationState.query = conversationSearch.value.trim();
  window.clearTimeout(searchTimeout);
  searchTimeout = window.setTimeout(applyConversationFilters, 280);
});

conversationPeriod.addEventListener('change', () => {
  conversationState.period = conversationPeriod.value;
  applyConversationFilters();
});

conversationSort.addEventListener('change', () => {
  conversationState.sort = conversationSort.value;
  applyConversationFilters();
});

resetFiltersButton.addEventListener('click', () => {
  conversationSearch.value = '';
  conversationPeriod.value = 'all';
  conversationSort.value = 'newest';
  Object.assign(conversationState, { page: 1, period: 'all', query: '', sort: 'newest' });
  applyConversationFilters();
});

previousPageButton.addEventListener('click', async () => {
  if (conversationState.page <= 1) return;
  conversationState.page--;
  await loadConversations();
  document.getElementById('conversations').scrollIntoView({ behavior: 'smooth' });
});

nextPageButton.addEventListener('click', async () => {
  if (conversationState.page >= conversationState.pages) return;
  conversationState.page++;
  await loadConversations();
  document.getElementById('conversations').scrollIntoView({ behavior: 'smooth' });
});

conversationList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-conversation-id]');
  if (button) openConversation(button.dataset.conversationId);
});

exportJsonButton.addEventListener('click', () => startExport('json'));
exportCsvButton.addEventListener('click', () => startExport('csv'));

clearConversationsButton.addEventListener('click', async () => {
  if (!window.confirm('確定要永久清除所有匿名對話紀錄？這項操作不能復原。')) return;

  clearConversationsButton.disabled = true;
  try {
    await requestApi('/api/admin/conversations', { method: 'DELETE' });
    conversationState.page = 1;
    await refreshDashboard();
    showToast('匿名對話紀錄已清除。');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    clearConversationsButton.disabled = false;
  }
});

deleteConversationButton.addEventListener('click', async () => {
  if (!conversationState.selectedId || !window.confirm('確定要刪除這段對話？這項操作不能復原。')) return;

  deleteConversationButton.disabled = true;
  try {
    await requestApi(`/api/admin/conversations/${encodeURIComponent(conversationState.selectedId)}`, { method: 'DELETE' });
    closeDialog();
    await refreshDashboard();
    showToast('對話已刪除。');
  } catch (error) {
    showToast(error.message, true);
    deleteConversationButton.disabled = false;
  }
});

closeConversationDialog.addEventListener('click', closeDialog);
closeConversationButton.addEventListener('click', closeDialog);
conversationDialog.addEventListener('click', (event) => {
  if (event.target === conversationDialog) closeDialog();
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

document.addEventListener('keydown', (event) => {
  const target = event.target;
  const isTyping = ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
  if (event.key === '/' && !isTyping && !conversationDialog.open) {
    event.preventDefault();
    conversationSearch.focus();
  }
});

initialise();
