/* ══════════════════════════════════════════════════════════════════════
   فرفشة — تطبيق غرف صوتية مباشرة (ويب/PWA)
   الطبقات: Supabase (حسابات + قاعدة بيانات + لحظي) · Agora (صوت)
   لا أسرار في العميل: إصدار توكن الصوت يتم عبر Edge Function بجلسة المستخدم.
   ══════════════════════════════════════════════════════════════════════ */
'use strict';

const CFG = window.FARFASHA_CONFIG || {};
const SB = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 8 } },
});

const SEAT_COUNT = 8;
const CATS = ['كلام', 'أغاني', 'ألعاب', 'قرآن', 'دراسة', 'رياضة'];

/* حدود الطبقات المجانية — تُعرض في الواجهة ولوحة الإدارة (ضمانات عدم التجاوز) */
const FREE_LIMITS = {
  agoraMinutesPerMonth: { used: 0, cap: 10000, label: 'دقائق صوت Agora / شهر' },
  supabaseDbBytes: { used: 0, cap: 500 * 1024 * 1024, label: 'حجم قاعدة البيانات', bytes: true },
  supabaseMau: { used: 0, cap: 50000, label: 'مستخدمون نشطون شهريًا' },
  realtimePeak: { used: 0, cap: 200, label: 'اتصالات لحظية متزامنة' },
  pagesBandwidth: { used: 0, cap: 100 * 1024 * 1024, label: 'نقل استضافة ثابتة', bytes: true },
};

const S = {
  user: null, profile: null,
  room: null, seats: [], members: [], messages: [],
  rtc: null, joined: false, micOn: false, isSpeaker: false,
  channel: null, subs: [], volumeTimer: null, uid: null,
  lastJoinAt: 0, voiceSeconds: 0,
};

/* ─────────── أدوات ─────────── */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (iso) => { try { const d = new Date(iso); return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
const fmtBytes = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + ' م.ب' : b > 1024 ? (b / 1024).toFixed(0) + ' ك.ب' : (b || 0) + ' بايت';

function toast(msg, kind) {
  const d = document.createElement('div');
  d.className = 'toast' + (kind ? ' ' + kind : '');
  d.textContent = msg;
  $('#toasts').appendChild(d);
  setTimeout(() => { d.style.opacity = '0'; d.style.transform = 'translateY(6px)'; }, 3600);
  setTimeout(() => d.remove(), 4200);
}
const errToAr = (e) => {
  const m = (e && (e.message || e.error_description || e.error || e.toString())) || '';
  if (/already registered|already exists/i.test(m)) return 'البريد مسجّل بالفعل — جرّب الدخول.';
  if (/Invalid login/i.test(m)) return 'البريد أو كلمة السر غلط.';
  if (/Email not confirmed/i.test(m)) return 'لازم تأكيد البريد — شوف بريدك أول.';
  if (/Password should be/i.test(m)) return 'كلمة السر 6 أحرف على الأقل.';
  if (/42501|not allowed|permission/i.test(m)) return 'مالكش صلاحية تعمل الإجراء ده.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'تعذّر الاتصال — اتأكد من النت.';
  return m.slice(0, 160);
};

/* ─────────── خلفية الجزيئات (Active Theory) ─────────── */
(function particles() {
  const cv = $('#fx'), ctx = cv.getContext('2d');
  let w, h, pts = [], mouse = { x: -999, y: -999 };
  function resize() {
    w = cv.width = window.innerWidth; h = cv.height = window.innerHeight;
    const n = Math.min(120, Math.round((w * h) / 22000));
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - .5) * .28, vy: (Math.random() - .5) * .28,
      r: Math.random() * 1.7 + .5, hue: Math.random() > .5 ? 187 : 268,
    }));
  }
  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  resize();
  (function loop() {
    ctx.clearRect(0, 0, w, h);
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy);
      if (d < 130) { p.x += dx / d * .7; p.y += dy / d * .7; }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283);
      ctx.fillStyle = 'hsla(' + p.hue + ',95%,68%,.55)'; ctx.fill();
    }
    ctx.lineWidth = .4;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j], dd = Math.hypot(a.x - b.x, a.y - b.y);
      if (dd < 118) {
        ctx.strokeStyle = 'hsla(210,90%,70%,' + (0.1 * (1 - dd / 118)).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    requestAnimationFrame(loop);
  })();
})();

/* ─────────── التنقّل ─────────── */
function show(view) {
  ['login', 'lobby', 'room', 'me', 'admin'].forEach((v) => { $('#view-' + v).hidden = v !== view; });
  const on = !!S.user;
  $('#navLobby').hidden = !on; $('#navMe').hidden = !on; $('#navOut').hidden = !on;
  $('#navAdmin').hidden = !(on && S.profile && S.profile.is_super_admin);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('#navLobby').onclick = () => { leaveRoom(); show('lobby'); loadRooms(); };
$('#navMe').onclick = () => { leaveRoom(); show('me'); fillMe(); loadMyStats(); };
$('#navAdmin').onclick = () => { leaveRoom(); show('admin'); loadAdmin(); };
$('#navOut').onclick = async () => { await leaveRoom(true); await SB.auth.signOut(); location.hash = ''; };
$('#brandHome').onclick = () => { if (S.user) { leaveRoom(); show('lobby'); loadRooms(); } };

/* ══════════════ المصادقة ══════════════ */
let signupMode = false;
$('#btnToggleAuth').onclick = () => {
  signupMode = !signupMode;
  $('#authTitle').textContent = signupMode ? 'إنشاء حساب' : 'دخول';
  $('#btnAuth').textContent = signupMode ? 'إنشاء الحساب' : 'دخول';
  $('#btnToggleAuth').textContent = signupMode ? 'عندي حساب بالفعل' : 'إنشاء حساب جديد';
  $('#authHint').textContent = signupMode
    ? 'لو التأكيد مفعّل في المشروع، هيوصلك رابط تأكيد على البريد.'
    : 'بريدك الإلكتروني وكلمة سر (6 أحرف على الأقل).';
};
async function doAuth() {
  const email = $('#email').value.trim(), pass = $('#password').value;
  if (!email.includes('@')) return toast('اكتب بريد صحيح', 'bad');
  if (pass.length < 6) return toast('كلمة السر 6 أحرف على الأقل', 'bad');
  $('#authStatus').textContent = '…';
  try {
    if (signupMode) {
      const { data, error } = await SB.auth.signUp({ email, password: pass });
      if (error) throw error;
      if (!data.session) {
        toast('اتعمل الحساب ✅ — لو المشروع بيطلب تأكيد بريد، أكّده ثم دخل.', 'ok');
        $('#authStatus').textContent = '';
        signupMode = false; $('#authTitle').textContent = 'دخول'; $('#btnAuth').textContent = 'دخول';
        return;
      }
      S.user = data.user; toast('تم إنشاء الحساب 🎉', 'ok');
    } else {
      const { data, error } = await SB.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      S.user = data.user; toast('أهلاً بيك 👋', 'ok');
    }
    await loadProfile(S.user.id);
    show('lobby'); await loadRooms();
  } catch (e) { toast(errToAr(e), 'bad'); }
  $('#authStatus').textContent = '';
}
$('#btnAuth').onclick = doAuth;
$('#password').addEventListener('keydown', (e) => { if (e.key === 'Enter') doAuth(); });
$('#btnForgot').onclick = async () => {
  const email = $('#email').value.trim();
  if (!email.includes('@')) return toast('اكتب بريدك في الحقل الأول', 'bad');
  const { error } = await SB.auth.resetPasswordForEmail(email);
  toast(error ? errToAr(error) : 'بعتنالك رابط الاستعادة على ' + email, error ? 'bad' : 'ok');
};

async function loadProfile(userId) {
  const { data } = await SB.from('profiles').select('*').eq('id', userId).maybeSingle();
  S.profile = data;
  if (!data) {
    // أول دخول: ننشئ صفاً بسيطاً (السياسة تسمح بإدراج صفّك)
    const nm = (S.user.email || 'عضو').split('@')[0].slice(0, 20);
    await SB.from('profiles').insert({ id: userId, display_name: nm, avatar_url: '😎' }).then(() => {});
    const r2 = await SB.from('profiles').select('*').eq('id', userId).maybeSingle();
    S.profile = r2.data;
  }
  $('#userChip').textContent = (S.profile ? S.profile.avatar_url || '😎' : '😎') + ' ' + (S.profile ? S.profile.display_name : '');
  $('#userChip').hidden = false;
}

// ⚠️ مهم: لا نستخدم await على نداءات Supabase داخل onAuthStateChange — فهذا
// يُجمّد العميل (سلوك موثّق في supabase-js). نُخرج العمل لخارج المعالج.
SB.auth.onAuthStateChange((_ev, session) => {
  const sess = session;
  setTimeout(async () => {
    S.user = sess ? sess.user : null;
    if (S.user) {
      try { await loadProfile(S.user.id); } catch (e) { console.warn('profile', e); }
      if (location.hash.startsWith('#/room/')) { show('room'); enterRoom(location.hash.split('/')[2]); }
      else { show('lobby'); loadRooms(); }
    } else {
      S.profile = null; $('#userChip').hidden = true; show('login');
    }
  }, 0);
});
(async () => {
  const { data } = await SB.auth.getSession();
  if (data.session) { S.user = data.session.user; await loadProfile(S.user.id); show('lobby'); loadRooms(); }
  else show('login');
})();

/* ══════════════ الردهة ══════════════ */
async function loadRooms() {
  const { data, error } = await SB.from('rooms')
    .select('id,title,category,is_private,is_locked,topic,owner_id,created_at')
    .order('created_at', { ascending: false }).limit(60);
  if (error) return toast(errToAr(error), 'bad');
  renderRooms(data || []);
  renderUsage();
}
function renderRooms(rooms) {
  $('#roomsCount').textContent = rooms.length;
  $('#roomsEmpty').hidden = rooms.length > 0;
  const g = $('#roomsGrid'); g.innerHTML = '';
  for (const r of rooms) {
    const el = document.createElement('div');
    el.className = 'roomcard';
    el.innerHTML =
      '<div class="t">' + (r.is_private ? '🔒 ' : '🎙️ ') + esc(r.title) + '</div>' +
      '<div class="m"><span class="tag">' + esc(r.category || 'عام') + '</span>' +
      (r.is_locked ? '<span class="tag">مقفولة</span>' : '') +
      '<span class="tag">' + fmtTime(r.created_at) + '</span></div>' +
      '<div class="m">' + (r.owner_id === (S.user && S.user.id) ? '<span class="tag">غرفتي</span>' : '') + '</div>';
    el.onclick = () => enterRoom(r.id);
    g.appendChild(el);
  }
}
$('#btnCreateRoom').onclick = async () => {
  const title = prompt('اسم الغرفة؟');
  if (!title || title.trim().length < 2) return;
  const category = prompt('التصنيف؟ (' + CATS.join(' / ') + ')', 'كلام') || 'كلام';
  const isPrivate = confirm('غرفة خاصة بكلمة سر؟ (موافق = خاصة)');
  let password = null;
  if (isPrivate) { password = prompt('كلمة السر (4–12 حرف)'); if (!password || password.length < 4) return toast('كلمة السر 4–12 حرف', 'bad'); }
  const { data, error } = await SB.rpc('create_room', { p_title: title.trim(), p_category: category, p_is_private: isPrivate, p_password: password });
  if (error) return toast(errToAr(error), 'bad');
  toast('اتعملت الغرفة 🎉', 'ok');
  await loadRooms();
  enterRoom(typeof data === 'string' ? data : (data && data.id) || data);
};
$('#btnRefreshAdmin').onclick = loadAdmin;
$('#refreshRooms') && ($('#refreshRooms').onclick = loadRooms);

/* ══════════════ الغرفة ══════════════ */
window.addEventListener('hashchange', () => {
  const h = location.hash;
  if (h.startsWith('#/room/')) enterRoom(h.split('/')[2]);
});
async function enterRoom(roomId) {
  if (!roomId) return;
  const { data: room, error } = await SB.from('rooms').select('*').eq('id', roomId).maybeSingle();
  if (error || !room) return toast('الغرفة غير موجودة', 'bad');
  S.room = room; location.hash = '#/room/' + roomId;

  // خاص؟ اطلب كلمة السر (السوبر أدمن يتخطّى)
  if (room.is_private && !(S.profile && S.profile.is_super_admin)) {
    const pwd = prompt('الغرفة خاصة 🔒 — اكتب كلمة السر');
    if (pwd === null) { location.hash = ''; return show('lobby'); }
    const { data: ok } = await SB.rpc('verify_room_password', { p_room_id: roomId, p_password: pwd });
    if (ok !== true) { toast('كلمة السر غلط 🔒', 'bad'); location.hash = ''; return show('lobby'); }
  }

  $('#roomTitle').textContent = room.title;
  $('#roomMeta').textContent = (room.category || 'عام') + ' · ' + (room.is_private ? 'خاصة' : 'عامة') + (room.is_locked ? ' · مقفولة' : '');
  $('#roomTopic').hidden = !room.topic; $('#roomTopic').textContent = room.topic || '';
  show('room');

  await loadMembers();
  await loadMessages();

  // الانضمام: السوبر أدمن يصبح مالكًا ويأخذ كرسيًا تلقائيًا
  const mine = S.members.find((m) => m.user_id === S.user.id);
  if (!mine) {
    if (S.profile && S.profile.is_super_admin) {
      const { data: seat, error: e2 } = await SB.rpc('admin_join_room', { p_room: roomId });
      if (e2) toast(errToAr(e2), 'bad'); else toast('دخلت كأدمن 👑 — كرسي ' + seat, 'ok');
    } else {
      await SB.from('room_members').insert({ room_id: roomId, user_id: S.user.id, role: 'listener' }).then(() => {});
    }
    await loadMembers();
  }
  subscribeRoom(roomId);
  await joinVoice(roomId);
  renderModeration();
}

async function loadMembers() {
  const { data } = await SB.from('room_members')
    .select('room_id,user_id,role,seat_number,is_muted,mic_requested').eq('room_id', S.room.id);
  const rows = data || [];
  const ids = rows.map((r) => r.user_id);
  let profs = [];
  if (ids.length) { const r = await SB.from('profiles').select('id,display_name,avatar_url').in('id', ids); profs = r.data || []; }
  const pm = Object.fromEntries(profs.map((p) => [p.id, p]));
  S.members = rows.map((r) => ({ ...r, name: (pm[r.user_id] || {}).display_name || 'عضو', avatar: (pm[r.user_id] || {}).avatar_url || '😎' }));
  renderSeats(); renderMicBar(); renderModeration();
}

async function loadMessages() {
  const { data } = await SB.from('messages').select('*')
    .eq('room_id', S.room.id).order('created_at', { ascending: false }).limit(60);
  S.messages = (data || []).reverse();
  const ids = [...new Set(S.messages.map((m) => m.sender_id))];
  let pm = {};
  if (ids.length) { const r = await SB.from('profiles').select('id,display_name,avatar_url').in('id', ids); pm = Object.fromEntries((r.data || []).map((p) => [p.id, p])); }
  renderMessages(pm); S._pm = pm;
}

function renderSeats() {
  const taken = S.members.filter((m) => m.seat_number !== null && m.seat_number >= 0);
  const grid = $('#seatGrid'); grid.innerHTML = '';
  const maxSeat = Math.max(SEAT_COUNT - 1, ...taken.map((m) => m.seat_number));
  for (let i = 0; i <= maxSeat; i++) {
    const m = taken.find((x) => x.seat_number === i);
    const d = document.createElement('div');
    d.className = 'seat' + (m ? ' occupied' : '') + (m && m.user_id === S.user.id && S.micOn && !m.is_muted ? ' speaking' : '');
    d.dataset.uid = m ? m.user_id : '';
    if (m) {
      const rl = m.role === 'owner' ? '👑 مضيف' : m.role === 'admin' ? '🛡️ مشرف' : '🎤 متحدث';
      d.innerHTML = '<div class="mk">' + (m.is_muted ? '🔇' : '🎙️') + '</div>' +
        '<div class="av">' + esc(m.avatar) + '</div>' +
        '<div class="nm">' + esc(m.name) + '</div>' +
        '<div class="rl">' + rl + '</div>' +
        '<div class="bar"><i></i></div>';
      d.onclick = () => openMemberMenu(m);
    } else {
      d.innerHTML = '<div class="av" style="opacity:.35">＋</div><div class="rl">كرسي ' + (i + 1) + ' فاضي</div>';
      d.onclick = () => askForSeat(i);
    }
    grid.appendChild(d);
  }
  $('#seatsHint').textContent = taken.length + '/' + (maxSeat + 1) + ' على المايك';
  renderMicBar();
}

function me() { return S.members.find((m) => m.user_id === S.user.id) || null; }
function isMod() { const m = me(); return !!m && (m.role === 'owner' || m.role === 'admin'); }

function renderMicBar() {
  const m = me(), b = $('#btnMic'), h = $('#micHint');
  if (!m) { b.textContent = 'اطلب المايك'; h.textContent = ''; return; }
  if (m.seat_number !== null && m.seat_number !== undefined) {
    b.textContent = m.is_muted ? '🔇 افتح المايك' : '🎙️ اكتم';
    h.textContent = 'أنت على الكرسي ' + (m.seat_number + 1);
  } else if (m.mic_requested) {
    b.textContent = 'إلغاء الطلب'; h.textContent = 'طلبك مستني موافقة المضيف…';
  } else if (isMod()) {
    b.textContent = '👑 اخد كرسي (إدارة)'; h.textContent = 'كمالك تقدر تاخد كرسي مباشرة';
  } else { b.textContent = 'اطلب المايك'; h.textContent = ''; }
}
$('#btnMic').onclick = async () => {
  const m = me(); if (!m) return;
  try {
    if (m.seat_number !== null && m.seat_number !== undefined) {
      await SB.from('room_members').update({ is_muted: !m.is_muted }).eq('room_id', S.room.id).eq('user_id', S.user.id);
      await setMicPublish(!m.is_muted);
    } else if (m.mic_requested) {
      await SB.from('room_members').update({ mic_requested: false }).eq('room_id', S.room.id).eq('user_id', S.user.id);
      toast('اتلغى الطلب');
    } else if (isMod()) {
      const seat = firstFreeSeat();
      await SB.from('room_members').update({ role: 'owner', seat_number: seat, is_muted: false }).eq('room_id', S.room.id).eq('user_id', S.user.id);
      await setMicPublish(true); toast('اتفضلت على الكرسي ' + (seat + 1), 'ok');
    } else {
      await SB.from('room_members').update({ mic_requested: true }).eq('room_id', S.room.id).eq('user_id', S.user.id);
      toast('تم إرسال الطلب — مستني موافقة المضيف', 'ok');
    }
  } catch (e) { toast(errToAr(e), 'bad'); }
  await loadMembers();
};
function firstFreeSeat() {
  const used = new Set(S.members.map((m) => m.seat_number).filter((s) => s !== null && s !== undefined));
  for (let i = 0; i < SEAT_COUNT; i++) if (!used.has(i)) return i;
  return Math.max(SEAT_COUNT - 1, ...used) + 1;
}
async function askForSeat(i) {
  const m = me(); if (!m) return;
  try {
    if (isMod()) {
      await SB.from('room_members').update({ role: 'speaker', seat_number: i, is_muted: false, mic_requested: false }).eq('room_id', S.room.id).eq('user_id', S.user.id);
      await setMicPublish(true);
    } else {
      await SB.from('room_members').update({ mic_requested: true }).eq('room_id', S.room.id).eq('user_id', S.user.id);
      toast('طلبك اتبعت 🎤 — مستني المضيف', 'ok');
    }
  } catch (e) { toast(errToAr(e), 'bad'); }
  await loadMembers();
}

/* قائمة إجراءات على عضو */
function openMemberMenu(m) {
  if (!isMod() || m.user_id === S.user.id) return;
  const acts = [];
  if (m.seat_number !== null && m.seat_number !== undefined) acts.push(['⬇️ أنزله من الكرسي', 'unseat']);
  acts.push([m.is_muted ? '🔊 افتح مايكه' : '🔇 اكتمه', 'mute']);
  if (m.role !== 'admin' && m.role !== 'owner') acts.push(['🛡️ رقّيه مشرف', 'admin']);
  if (m.role === 'admin') acts.push(['↙️ شيل الإشراف', 'demote']);
  acts.push(['🚪 اطرده', 'kick']);
  acts.push(['⛔ احظره من الغرفة', 'ban']);
  const pick = prompt(acts.map((a, i) => (i + 1) + ') ' + a[0]).join('\n'));
  const idx = parseInt(pick, 10) - 1;
  if (isNaN(idx) || !acts[idx]) return;
  doModeration(acts[idx][1], m);
}
function openMemberMenuPub(m) { openMemberMenu(m); }

async function doModeration(action, m) {
  const rid = S.room.id;
  try {
    if (action === 'unseat') await SB.rpc('room_set_role', { p_room: rid, p_user: m.user_id, p_role: 'listener' });
    if (action === 'mute') await SB.rpc('room_mute_all', { p_room: rid, p_muted: true }).then(async () => {
      await SB.from('room_members').update({ is_muted: true }).eq('room_id', rid).eq('user_id', m.user_id);
    });
    if (action === 'admin') await SB.rpc('room_set_role', { p_room: rid, p_user: m.user_id, p_role: 'admin' });
    if (action === 'demote') await SB.rpc('room_set_role', { p_room: rid, p_user: m.user_id, p_role: 'listener' });
    if (action === 'kick') await SB.rpc('room_kick', { p_room: rid, p_user: m.user_id });
    if (action === 'ban') {
      const reason = prompt('سبب الحظر؟') || null;
      await SB.rpc('room_ban', { p_room: rid, p_user: m.user_id, p_reason: reason });
    }
    await SB.rpc('admin_log', { p_action: 'رقابة: ' + action, p_target: m.name, p_details: 'غرفة: ' + S.room.title });
    toast('تم الإجراء ✅ (' + action + ')', 'ok');
  } catch (e) { toast(errToAr(e), 'bad'); }
  await loadMembers();
}

/* ── الشات ── */
function renderMessages(pm) {
  const box = $('#msgs'); pm = pm || S._pm || {};
  box.innerHTML = '';
  for (const m of S.messages) {
    const isSys = m.type === 'system';
    const d = document.createElement('div');
    d.className = 'msg' + (isSys ? ' sys' : '');
    if (isSys) { d.textContent = m.body; }
    else {
      const p = pm[m.sender_id] || {};
      d.innerHTML = '<div class="who">' + esc(p.display_name || 'عضو') + '<span>' + fmtTime(m.created_at) + '</span></div>' + esc(m.body);
    }
    box.appendChild(d);
  }
  $('#chatCount').textContent = S.messages.length + ' رسالة';
  box.scrollTop = box.scrollHeight;
}
$('#chatForm').onsubmit = async (e) => {
  e.preventDefault();
  const v = $('#chatInput').value.trim(); if (!v || !S.room) return;
  $('#chatInput').value = '';
  const { error } = await SB.from('messages').insert({ room_id: S.room.id, sender_id: S.user.id, body: v.slice(0, 300), type: 'text' });
  if (error) toast(errToAr(error), 'bad');
};

/* ── الاشتراك اللحظي ── */
function subscribeRoom(roomId) {
  unsubscribeRoom();
  const ch = SB.channel('room-' + roomId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: 'room_id=eq.' + roomId }, () => loadMembers())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'room_id=eq.' + roomId }, async () => { await loadMessages(); })
    .subscribe();
  S.subs.push(ch);
}
function unsubscribeRoom() { S.subs.forEach((c) => { try { SB.removeChannel(c); } catch (e) {} }); S.subs = []; }

/* ══════════════ الصوت (Agora) ══════════════ */
async function mintToken(channel, uid) {
  try {
    const { data: sess } = await SB.auth.getSession();
    const jwt = sess && sess.session ? sess.session.access_token : '';
    if (!jwt) return null;
    const res = await fetch(CFG.SUPABASE_URL + '/functions/v1/mint-rtc-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt, apikey: CFG.SUPABASE_ANON_KEY },
      body: JSON.stringify({ channel: channel, uid: uid }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j.token || j.rtcToken || null;
  } catch (e) { return null; }
}

async function joinVoice(roomId) {
  if (!window.AgoraRTC) { toast('تعذّر تحميل مكتبة الصوت', 'bad'); return; }
  await leaveVoice();
  S.uid = Math.floor(Math.random() * 100000) + 1000;
  const token = await mintToken(roomId, S.uid);
  S.rtc = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

  S.rtc.on('user-joined', (u) => { console.log('[voice] REMOTE JOINED', u.uid); toast('حد دخل القعدة 👋'); });
  S.rtc.on('user-left', (u) => { console.log('[voice] REMOTE LEFT', u.uid); });
  S.rtc.on('user-published', async (u, media) => {
    console.log('[voice] REMOTE AUDIO from', u.uid);
    await S.rtc.subscribe(u, media);
    if (media === 'audio') { const t = u.audioTrack; if (t) { t.setVolume(100); t.play(); } }
  });
  S.rtc.on('connection-state-change', (st) => {
    console.log('[voice] state', st);
    setVoiceChip(st === 'CONNECTED' ? 'متصل 🎧' : st === 'RECONNECTING' ? 'إعادة اتصال…' : String(st).toLowerCase());
  });
  S.rtc.on('volume-indicator', (vols) => {
    vols.forEach((v) => {
      const el = document.querySelector('.seat[data-uid="' + v.uid + '"] .bar i');
      if (el) el.style.width = Math.min(100, Math.round(v.level * 5)) + '%';
    });
  });

  const onSeat = !!(me() && me().seat_number !== null && me().seat_number !== undefined);
  try {
    await S.rtc.join(CFG.AGORA_APP_ID, roomId, token, S.uid);
    await S.rtc.setClientRole(onSeat ? 'host' : 'audience');
    S.rtc.enableAudioVolumeIndicator();
    if (onSeat) {
      if (!S.micTrack) S.micTrack = await AgoraRTC.createMicrophoneAudioTrack();
      await S.rtc.publish([S.micTrack]);
      S.micOn = true;
    }
    S.joined = true; S.isSpeaker = onSeat; S.lastJoinAt = Date.now();
    setVoiceChip('متصل 🎧');
    console.log('[voice] joined channel=' + roomId + ' uid=' + S.uid + ' host=' + onSeat);
  } catch (e) {
    console.error('[voice] join failed', e);
    setVoiceChip('تعذّر الاتصال', true);
    toast('تعذّر الانضمام للصوت: ' + (e && e.message ? e.message : e), 'bad');
  }
}
async function setMicPublish(on) {
  try {
    if (!S.rtc || !S.joined) return;
    if (on) {
      await S.rtc.setClientRole('host');
      if (!S.micTrack) S.micTrack = await AgoraRTC.createMicrophoneAudioTrack();
      await S.rtc.publish([S.micTrack]);
      S.micOn = true; S.isSpeaker = true;
    } else {
      if (S.micTrack) { await S.rtc.unpublish([S.micTrack]); }
      S.micOn = false;
    }
    console.log('[voice] mic publish=' + on);
  } catch (e) { toast('تعذّر تغيير المايك', 'bad'); }
}
function setVoiceChip(txt, bad) {
  const c = $('#voiceState'); c.textContent = txt;
  c.className = 'chip ' + (bad ? 'off' : 'live');
}
async function leaveVoice() {
  try {
    if (S.micTrack) { S.micTrack.stop(); S.micTrack.close(); S.micTrack = null; }
    if (S.rtc) { await S.rtc.leave(); S.rtc = null; }
  } catch (e) {}
  if (S.lastJoinAt) { S.voiceSeconds += Math.round((Date.now() - S.lastJoinAt) / 1000); S.lastJoinAt = 0; }
  S.joined = false; S.micOn = false; setVoiceChip('غير متصل');
}
async function leaveRoom(silent) {
  if (S.room) {
    unsubscribeRoom();
    await leaveVoice();
    if (!silent) toast('خرجت من الغرفة');
    S.room = null; S.members = []; S.messages = [];
  }
  if (location.hash.startsWith('#/room/')) location.hash = '';
}
$('#btnLeaveRoom').onclick = async () => { await leaveRoom(); show('lobby'); loadRooms(); };
window.addEventListener('beforeunload', () => { try { leaveVoice(); } catch (e) {} });

/* ══════════════ الرقابة (لوحة داخل الغرفة) ══════════════ */
function renderModeration() {
  $('#modCard').hidden = !isMod();
  if (!isMod()) return;
  const box = $('#modActions'); box.innerHTML = '';
  const reqs = S.members.filter((m) => m.mic_requested);
  for (const m of reqs) {
    const b = document.createElement('button');
    b.className = 'btn'; b.textContent = '✅ اقبل مايك ' + m.name;
    b.onclick = async () => {
      await SB.from('room_members').update({ role: 'speaker', seat_number: firstFreeSeat(), mic_requested: false, is_muted: false }).eq('room_id', S.room.id).eq('user_id', m.user_id);
      await SB.rpc('admin_log', { p_action: 'قبول طلب مايك', p_target: m.name, p_details: S.room.title });
      toast('اتقبل الطلب', 'ok'); await loadMembers();
    };
    const r = document.createElement('button');
    r.className = 'btn danger'; r.textContent = '❌ ارفض';
    r.onclick = async () => {
      await SB.from('room_members').update({ mic_requested: false }).eq('room_id', S.room.id).eq('user_id', m.user_id);
      await SB.rpc('admin_log', { p_action: 'رفض طلب مايك', p_target: m.name, p_details: S.room.title });
      await loadMembers();
    };
    box.appendChild(b); box.appendChild(r);
  }
  const mk = (label, fn, danger) => { const b = document.createElement('button'); b.className = 'btn' + (danger ? ' danger' : ''); b.textContent = label; b.onclick = fn; box.appendChild(b); };
  mk('🔇 اكتم الكل', async () => { await SB.rpc('room_mute_all', { p_room: S.room.id, p_muted: true }); await SB.rpc('admin_log', { p_action: 'كتم الكل', p_target: S.room.title }); await loadMembers(); });
  mk('📢 موضوع/إعلان', async () => { const t = prompt('الموضوع؟', S.room.topic || ''); if (t === null) return; await SB.rpc('room_set_topic', { p_room: S.room.id, p_topic: t }); await SB.rpc('admin_log', { p_action: 'تعديل الموضوع', p_target: S.room.title, p_details: t }); S.room.topic = t; $('#roomTopic').hidden = !t; $('#roomTopic').textContent = t; });
  mk((S.room.is_locked ? '🔓 افتح القعدة' : '🔒 اقفل القعدة'), async () => { await SB.rpc('room_set_locked', { p_room: S.room.id, p_locked: !S.room.is_locked }); await SB.rpc('admin_log', { p_action: 'تغيير القفل', p_target: S.room.title }); S.room.is_locked = !S.room.is_locked; });
  mk('⛔ المحظورون', async () => { const { data } = await SB.rpc('room_banned_list', { p_room: S.room.id }); alert((data || []).length ? (data || []).map((b) => '• ' + b.display_name + ' — ' + (b.reason || 'بلا سبب')).join('\n') : 'مفيش حد محظور'); });
  mk('🚩 إبلاغ عن عضو', async () => { const nm = prompt('اسم من تُبلّغ عنه؟'); if (!nm) return; const reason = prompt('السبب؟') || 'بلاغ'; const t = S.members.find((x) => x.name === nm); const { error } = await SB.from('reports').insert({ reporter_id: S.user.id, target_user_id: t ? t.user_id : null, reason: reason, details: 'غرفة: ' + S.room.title }); toast(error ? errToAr(error) : 'اتسجّل البلاغ 🚩', error ? 'bad' : 'ok'); });
}

/* ══════════════ حسابي ══════════════ */
function fillMe() {
  if (!S.profile) return;
  $('#meName').value = S.profile.display_name || '';
  $('#meBio').value = S.profile.bio || '';
  $('#meAvatar').value = S.profile.avatar_url || '😎';
  $('#meEmail').value = S.user.email || '';
}
$('#btnSaveMe').onclick = async () => {
  $('#meStatus').textContent = '…';
  try {
    const { error } = await SB.rpc('update_my_profile', {
      p_display_name: $('#meName').value.trim(),
      p_bio: $('#meBio').value.trim(),
      p_avatar_url: $('#meAvatar').value.trim() || '😎',
    });
    if (error) throw error;
    await loadProfile(S.user.id); toast('اتحفظ ✅', 'ok');
  } catch (e) { toast(errToAr(e), 'bad'); }
  $('#meStatus').textContent = '';
};
async function loadMyStats() {
  const { data } = await SB.rpc('profile_stats', { p_user: S.user.id });
  const s = data || {};
  $('#meStats').innerHTML = Object.entries({ 'متابعون': s.followers, 'يتابع': s.following, 'غرف': s.rooms, 'لحظات': s.moments, 'إعجابات': s.likes_received, 'رسائل': s.messages_sent })
    .map(([l, v]) => '<div class="kpi"><div class="v">' + (v || 0) + '</div><div class="l">' + l + '</div></div>').join('');
}

/* ══════════════ الإدارة ══════════════ */
$$('.tab').forEach((t) => t.onclick = () => {
  $$('.tab').forEach((x) => x.classList.remove('on')); t.classList.add('on');
  ['users', 'rooms', 'reports', 'audit', 'reports2'].forEach((k) => { $('#pane-' + k).hidden = k !== t.dataset.tab; });
});
async function loadAdmin() {
  try {
    const [{ data: st }, { data: us }, { data: rm }, { data: rp }, { data: au }] = await Promise.all([
      SB.rpc('admin_stats'), SB.rpc('admin_users'), SB.rpc('admin_rooms'), SB.from('reports').select('*').order('created_at', { ascending: false }).limit(60),
      SB.from('admin_audit_log').select('*').order('created_at', { ascending: false }).limit(120),
    ]);
    const s = st || {};
    $('#adminStats').innerHTML = Object.entries({
      'مستخدمون': s.users, 'غرف': s.rooms, 'أدمن': s.admins, 'أعضاء': s.members,
      'على الكراسي': s.on_seats, 'رسائل': s.messages, 'بلاغات مفتوحة': s.reports_open, 'أعطال': s.crashes,
    }).map(([l, v]) => '<div class="kpi"><div class="v">' + (v || 0) + '</div><div class="l">' + l + '</div></div>').join('');

    $('#pane-users').innerHTML = tbl(['الاسم', 'المستوى', 'غرف', 'أدمن'], (us || []).map((u) =>
      [esc(u.display_name), u.level, u.rooms_owned, u.is_super_admin ? '<span class="pill ok">أدمن ✓</span>' : 'عضو']));
    $('#pane-rooms').innerHTML = tbl(['الغرفة', 'المالك', 'أعضاء', 'خاصة', 'مقفولة'], (rm || []).map((r) =>
      [esc(r.title), esc(r.owner_name), r.members, r.is_private ? '🔒' : '—', r.is_locked ? 'نعم' : '—']));
    $('#pane-reports').innerHTML = tbl(['السبب', 'التفاصيل', 'الحالة', 'الوقت', 'إجراء'], (rp || []).map((r) =>
      [esc(r.reason), esc(r.details || ''), r.status === 'resolved' ? '<span class="pill ok">مغلق</span>' : '<span class="pill warn">مفتوح</span>', fmtTime(r.created_at),
       '<button class="btn" data-close="' + r.id + '">إغلاق</button>']));
    $$('[data-close]').forEach((b) => b.onclick = async () => {
      await SB.from('reports').update({ status: 'resolved' }).eq('id', b.dataset.close);
      await SB.rpc('admin_log', { p_action: 'إغلاق بلاغ', p_target: b.dataset.close });
      toast('اتقفل البلاغ', 'ok'); loadAdmin();
    });
    S.audit = au || [];
    await renderUsageReport();
    $('#pane-audit').innerHTML = tbl(['الإجراء', 'الفاعل', 'الهدف', 'تفاصيل', 'الوقت'], (au || []).map((a) =>
      [esc(a.action), esc(a.actor_name || ''), esc(a.target || ''), esc(a.details || ''), fmtTime(a.created_at)]));
  } catch (e) { toast(errToAr(e), 'bad'); }
}
function tbl(heads, rows) {
  return '<table><thead><tr>' + heads.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' +
    (rows.length ? rows.map((r) => '<tr>' + r.map((c) => '<td>' + c + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + heads.length + '">لا بيانات</td></tr>') +
    '</tbody></table>';
}
$('#btnExport').onclick = () => {
  const rows = S.audit || [];
  const head = ['id', 'action', 'actor_name', 'target', 'details', 'created_at'];
  const csv = '\ufeff' + head.join(',') + '\n' + rows.map((r) => head.map((h) => '"' + String(r[h] == null ? '' : r[h]).replace(/"/g, '""') + '"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'farfasha-audit-log.csv'; a.click();
  toast('اتصدّر السجل ⤓', 'ok');
};

/* ══════════════ حدود الطبقات المجانية ══════════════ */
async function renderUsage() {
  // قياس فعلي بسيط: عدد الصفوف + تقدير الاستهلاك
  try {
    const [{ count: rooms }, { count: msgs }, { count: profiles }] = await Promise.all([
      SB.from('rooms').select('*', { count: 'exact', head: true }),
      SB.from('messages').select('*', { count: 'exact', head: true }),
      SB.from('profiles').select('*', { count: 'exact', head: true }),
    ]);
    FREE_LIMITS.supabaseMau.used = profiles || 0;
    FREE_LIMITS.supabaseDbBytes.used = ((rooms || 0) * 800) + ((msgs || 0) * 260) + ((profiles || 0) * 700);
  } catch (e) {}
  FREE_LIMITS.agoraMinutesPerMonth.used = Math.round(S.voiceSeconds / 60);
  const g = $('#usageGrid');
  g.innerHTML = Object.values(FREE_LIMITS).map((L) => {
    const pct = Math.min(100, Math.round((L.used / L.cap) * 100));
    const usedTxt = L.bytes ? fmtBytes(L.used) : L.used;
    const capTxt = L.bytes ? fmtBytes(L.cap) : L.cap;
    return '<div class="kpi"><div class="v">' + pct + '%</div><div class="l">' + L.label + '</div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="cap">' + usedTxt + ' من ' + capTxt + '</div></div>';
  }).join('');
}
setInterval(() => { if (S.user && !S.room) renderUsage(); }, 60000);


/* ══ لوحة الاستهلاك (نمط Fathom: دقة علمية، رمادي/كحلي + لون تمييز واحد) ══
   تعرض لقطات الاستهلاك الحقيقية من جدول usage_snapshots + مؤشرات الحدود
   المجانية، مع هوامش مصدر لكل رقم — بلا زخرفة. */
async function renderUsageReport() {
  const box = document.querySelector('#pane-reports2');
  if (!box) return;
  let snaps = [];
  try {
    const { data } = await SB.from('usage_snapshots')
      .select('taken_at, db_bytes, rooms, messages, profiles, members')
      .order('taken_at', { ascending: false }).limit(14);
    snaps = (data || []).reverse();
  } catch (e) { /* الجدول قد يكون فارغًا */ }

  // نسجّل لقطة الآن لو مفيش لقطات (نحتاج صلاحية أدمن)
  if (!snaps.length) {
    try { await SB.rpc('snapshot_usage'); } catch (e) {}
    try {
      const { data } = await SB.from('usage_snapshots')
        .select('taken_at, db_bytes, rooms, messages, profiles, members')
        .order('taken_at', { ascending: false }).limit(14);
      snaps = (data || []).reverse();
    } catch (e) {}
  }

  const cap = 524288000;
  const pct = snaps.length ? Math.min(100, (snaps[snaps.length-1].db_bytes / cap) * 100) : 0;
  const maxV = Math.max(1, ...snaps.map(s => s.db_bytes || 0));

  // مخطط أعمدة SVG دقيق (بلا مكتبات)
  const W = 560, H = 120, pad = 22;
  const bw = snaps.length ? (W - pad * 2) / snaps.length : 0;
  const bars = snaps.map((s, i) => {
    const h = Math.round(((s.db_bytes || 0) / maxV) * (H - pad - 12));
    const x = pad + i * bw + 2;
    const y = H - pad - h;
    const hot = (s.db_bytes / cap) > 0.8;
    return '<rect class="bar' + (hot ? ' hot' : '') + '" x="' + x.toFixed(1) + '" y="' + y + '" width="' + Math.max(3, bw - 5).toFixed(1) + '" height="' + Math.max(1, h) + '" rx="2"/>';
  }).join('');
  const labels = snaps.map((s, i) => {
    if (i % Math.ceil(snaps.length / 6 || 1) !== 0) return '';
    const d = new Date(s.taken_at);
    const x = pad + i * bw + bw / 2;
    return '<text class="lbl" x="' + x.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + (d.getMonth()+1) + '/' + d.getDate() + '</text>';
  }).join('');

  const last = snaps[snaps.length - 1] || { db_bytes: 0, rooms: 0, messages: 0, profiles: 0, members: 0 };

  box.innerHTML =
    '<div class="fathom">' +
      '<p class="hd">لوحة الاستهلاك · حدود الطبقات المجانية</p>' +
      '<dl class="dl">' +
        '<dt>حجم القاعدة</dt><dd>' + fmtBytes(last.db_bytes) + ' / ' + fmtBytes(cap) + '  (' + pct.toFixed(2) + '%)</dd>' +
        '<dt>الغرف</dt><dd>' + last.rooms + '</dd>' +
        '<dt>الرسائل</dt><dd>' + last.messages + '</dd>' +
        '<dt>المستخدمون</dt><dd>' + last.profiles + '</dd>' +
        '<dt>العضويات</dt><dd>' + last.members + '</dd>' +
        '<dt>لقطات مسجَّلة</dt><dd>' + snaps.length + '</dd>' +
      '</dl>' +
      '<div class="chart">' +
        '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="مخطط حجم القاعدة عبر الزمن">' +
          '<line class="ax" x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - pad) + '" y2="' + (H - pad) + '"/>' +
          bars + labels +
        '</svg>' +
      '</div>' +
      '<p class="footnote">' +
        '<b>المصدر:</b> جدول <code>usage_snapshots</code> في قاعدة المشروع — يُكتب عبر الدالة <code>snapshot_usage()</code> (محميَّة بـ<code>is_admin()</code>).<br>' +
        '<b>حد Agora الصوتي:</b> 10,000 دقيقة/شهر — <span class="src">agora.io</span> · ' +
        '<b>حد Supabase:</b> 500 م.ب قاعدة · 1 ج.ب ملفات · 5 ج.ب نقل · 50,000 مستخدم/شهر — <span class="src">uibakery.io / designrevision.com</span>.<br>' +
        '<b>سلوك التجاوز:</b> عند 80% تنبيه · 95% تنظيف تلقائي للرسائل الأقدم من 30 يومًا · 100% توقف الكتابة حتى التنظيف.' +
      '</p>' +
    '</div>';
}

/* تسجيل الـSW */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
