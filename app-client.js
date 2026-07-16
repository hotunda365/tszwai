/* ================================================
   tszwai.com — App Logic
   ================================================ */

const DEFAULT_SETTINGS = {
  assistantName: '心靈導師',
  guestQuestionLimit: 5,
  replyStyle: 'supportive',
  serviceEnabled: true,
  welcomeMessage: '你好，我在這裡陪你。你可以慢慢說，今天最想被理解的是哪一部分？',
};

let appSettings = { ...DEFAULT_SETTINGS };
let quotaLeft = DEFAULT_SETTINGS.guestQuestionLimit;
let isWaiting = false;
let selectedEmotion = '';

const chatWindow   = document.getElementById('chat-window');
const messageList  = document.getElementById('message-list');
const userInput    = document.getElementById('user-input');
const sendBtn      = document.getElementById('send-btn');
const quotaCount   = document.getElementById('quota-count');
const loginModal   = document.getElementById('login-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnLogin     = document.getElementById('btn-login');
const assistantGreeting = document.getElementById('assistant-greeting');
const assistantNameDisplay = document.getElementById('assistant-name-display');
const visitorId = getVisitorId();

function getVisitorId() {
  const storageKey = 'mindful-session-visitor-id';

  try {
    let identifier = window.localStorage.getItem(storageKey);
    if (!identifier) {
      identifier = window.crypto?.randomUUID?.() || `guest_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(storageKey, identifier);
    }
    return identifier;
  } catch {
    return `guest_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

function updateQuota() {
  quotaCount.textContent = quotaLeft;
}

function applySettings(settings) {
  if (!settings || typeof settings !== 'object') return;

  const previouslyUsedQuestions = Math.max(0, appSettings.guestQuestionLimit - quotaLeft);
  appSettings = {
    ...DEFAULT_SETTINGS,
    ...settings,
  };
  quotaLeft = Math.max(0, appSettings.guestQuestionLimit - previouslyUsedQuestions);
  assistantNameDisplay.textContent = appSettings.assistantName;
  assistantGreeting.textContent = appSettings.welcomeMessage;
  document.title = `🪷 ${appSettings.assistantName} · Mindful Session`;
  updateQuota();
}

async function loadPublicSettings() {
  try {
    const response = await fetch('/api/public/config');
    if (!response.ok) throw new Error('Unable to load settings.');
    const payload = await response.json();
    applySettings(payload.settings);
  } catch {
    updateQuota();
  }
}

/* ── Particle canvas background ─────────────────── */
(function initCanvas() {
  const canvas = document.getElementById('bg-canvas');
  const ctx    = canvas.getContext('2d');
  let particles = [];
  let W, H;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  class Particle {
    constructor() { this.reset(true); }
    reset(initial) {
      this.x  = Math.random() * W;
      this.y  = initial ? Math.random() * H : H + 10;
      this.r  = Math.random() * 1.6 + 0.4;
      this.vx = (Math.random() - 0.5) * 0.3;
      this.vy = -(Math.random() * 0.5 + 0.2);
      this.alpha = Math.random() * 0.5 + 0.15;
      this.hue = 260 + Math.random() * 80; // purple → pink
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.alpha -= 0.0008;
      if (this.y < -10 || this.alpha <= 0) this.reset(false);
    }
    draw() {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle   = `hsl(${this.hue}, 80%, 75%)`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  for (let i = 0; i < 120; i++) particles.push(new Particle());

  // Spiral effect — slow rotating lines
  let spiralAngle = 0;
  function drawSpiral() {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(spiralAngle);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = Math.min(W, H) * 0.38;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.strokeStyle = `hsla(${270 + i * 20}, 70%, 70%, 0.03)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  function animate() {
    ctx.clearRect(0, 0, W, H);
    spiralAngle += 0.0008;
    drawSpiral();
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(animate);
  }
  animate();
})();

/* ── Auto-resize textarea ────────────────────────── */
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
});

/* ── Emotion tags ────────────────────────────────── */
document.querySelectorAll('.emotion-tag').forEach(tag => {
  tag.addEventListener('click', () => {
    document.querySelectorAll('.emotion-tag').forEach(t => t.classList.remove('active'));
    tag.classList.add('active');
    const emotion = tag.dataset.emotion;
    selectedEmotion = emotion;
    const prompts = {
      '焦慮': '我今天感到很焦慮，心跳加速，不知所措…',
      '平靜': '我想找回一種平靜的感覺…',
      '悲傷': '我今天心情很低落，有些難過…',
      '迷惘': '最近我對很多事情感到迷惘，不知道方向在哪…',
      '疲憊': '我真的很累，身心都感到疲憊…',
      '期待': '我心裡有一份期待，想和你分享…',
    };
    userInput.value = prompts[emotion] || '';
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
    userInput.focus();
  });
});

/* ── Send message ────────────────────────────────── */
function sendMessage() {
  const text = userInput.value.trim();
  if (!text || isWaiting) return;

  if (quotaLeft <= 0 || !appSettings.serviceEnabled) {
    loginModal.hidden = false;
    return;
  }

  // Append user bubble
  appendMsg('user', '🙏', text);
  userInput.value = '';
  userInput.style.height = 'auto';
  document.querySelectorAll('.emotion-tag').forEach(t => t.classList.remove('active'));

  // Show typing indicator
  const typingEl = appendTyping();
  isWaiting = true;
  sendBtn.disabled = true;

  fetch('/api/chat', {
    body: JSON.stringify({
      emotion: selectedEmotion,
      message: text,
      visitorId,
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.error || '目前無法回應，請稍後再試。');
        error.remaining = payload.remaining;
        error.status = response.status;
        throw error;
      }
      return payload;
    })
    .then((payload) => {
      quotaLeft = Number.isInteger(payload.remaining) ? payload.remaining : Math.max(0, quotaLeft - 1);
      updateQuota();
      appendMsg('ai', '🌿', payload.reply);

      if (quotaLeft === 0) {
        window.setTimeout(() => { loginModal.hidden = false; }, 800);
      }
    })
    .catch((error) => {
      if (Number.isInteger(error.remaining)) {
        quotaLeft = error.remaining;
        updateQuota();
      }
      appendMsg('ai', '🌿', error.message);
      if (error.status === 429 || !appSettings.serviceEnabled) {
        loginModal.hidden = false;
      }
    })
    .finally(() => {
      typingEl.remove();
      isWaiting = false;
      sendBtn.disabled = false;
    });
}

sendBtn.addEventListener('click', sendMessage);

userInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

/* ── DOM helpers ─────────────────────────────────── */
function appendMsg(role, avatar, text) {
  const wrap = document.createElement('div');
  wrap.className = `msg ${role} fade-in`;

  const ava = document.createElement('div');
  ava.className = 'msg-avatar';
  ava.textContent = avatar;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;

  wrap.appendChild(ava);
  wrap.appendChild(bubble);
  messageList.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function appendTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'msg ai typing fade-in';

  const ava = document.createElement('div');
  ava.className = 'msg-avatar';
  ava.textContent = '🌿';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  for (let i = 0; i < 3; i++) {
    const d = document.createElement('span');
    d.className = 'dot';
    bubble.appendChild(d);
  }

  wrap.appendChild(ava);
  wrap.appendChild(bubble);
  messageList.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function scrollToBottom() {
  chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });
}

/* ── Modal ───────────────────────────────────────── */
btnCloseModal.addEventListener('click', () => {
  loginModal.hidden = true;
});

btnLogin.addEventListener('click', () => {
  loginModal.hidden = true;
  userInput.focus();
});

loginModal.addEventListener('click', e => {
  if (e.target === loginModal) loginModal.hidden = true;
});

loadPublicSettings();
