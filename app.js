/* ================================================
   tszwai.com — App Logic
   ================================================ */

const QUOTA_MAX = 5;
let quotaLeft = QUOTA_MAX;
let isWaiting = false;

const chatWindow   = document.getElementById('chat-window');
const messageList  = document.getElementById('message-list');
const userInput    = document.getElementById('user-input');
const sendBtn      = document.getElementById('send-btn');
const quotaCount   = document.getElementById('quota-count');
const loginModal   = document.getElementById('login-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnLogin     = document.getElementById('btn-login');

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

  if (quotaLeft <= 0) {
    loginModal.hidden = false;
    return;
  }

  // Append user bubble
  appendMsg('user', '🙏', text);
  userInput.value = '';
  userInput.style.height = 'auto';
  document.querySelectorAll('.emotion-tag').forEach(t => t.classList.remove('active'));

  quotaLeft--;
  quotaCount.textContent = quotaLeft;

  // Show typing indicator
  const typingEl = appendTyping();
  isWaiting = true;
  sendBtn.disabled = true;

  // Simulate AI response (replace with real API call)
  setTimeout(() => {
    typingEl.remove();
    const reply = generateReply(text);
    appendMsg('ai', '🌿', reply);
    isWaiting = false;
    sendBtn.disabled = false;

    if (quotaLeft === 0) {
      setTimeout(() => { loginModal.hidden = false; }, 800);
    }
  }, 1800 + Math.random() * 800);
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
  // Render newlines
  bubble.innerHTML = text.replace(/\n/g, '<br/>');

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

/* ── Placeholder AI replies ──────────────────────── */
// Replace this function with a real API call to your backend
function generateReply(userText) {
  const responses = [
    '謝謝你願意分享這些。\n\n聽到你說的，我感受到你心裡承載了很多。\n\n你可以再說說，是什麼讓你現在特別有這種感覺嗎？',
    '我在這裡，慢慢來。\n\n你說的每一個字，我都認真在聽。\n\n你現在身體上有感受到什麼嗎？比如胸口、肩膀，或者呼吸的節奏？',
    '你有這樣的感受，是完全可以被理解的。\n\n有時候，光是說出口，就已經是一種勇氣。\n\n你最希望今天離開這裡時，帶走什麼樣的感覺？',
    '我想先陪你在這個感受裡待一會兒。\n\n不需要急著改變什麼。\n\n你有沒有一個最近讓你感到一點點溫暖的小事，可以分享給我？',
    '你說的，讓我想更了解你。\n\n在你心裡，什麼是你最難放下的部分？',
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

/* ── Modal ───────────────────────────────────────── */
btnCloseModal.addEventListener('click', () => {
  loginModal.hidden = true;
});

btnLogin.addEventListener('click', () => {
  // Replace with real login redirect
  window.location.href = '/login';
});

loginModal.addEventListener('click', e => {
  if (e.target === loginModal) loginModal.hidden = true;
});
