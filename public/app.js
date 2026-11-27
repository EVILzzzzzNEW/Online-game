/* HackChat v0.2 - Full feature set */
const $ = (id) => document.getElementById(id);
const socket = io();

let ME = null;
let usersById = {};
let installed = JSON.parse(localStorage.getItem('hc_installed') || '{}');
let termColor = localStorage.getItem('hc_term_color') || '0';
let TSTATE = { mode: 'idle', data: {} };
let adminToken = null;
let cmdHistory = JSON.parse(localStorage.getItem('hc_history') || '[]');
let histIdx = -1;
let soundOn = localStorage.getItem('hc_sound') !== '0';
let matrixTimer = null;

/* network state */
let internet = { connected: false, ssid: null };
let vpn = { active: false, timer: null, mullvad: false, country: null };

const NETWORKS = [
  { ssid: 'HackChat-Free-Wifi', auth: false, password: '' },
  { ssid: 'Student-Network', auth: true, password: 'studeNT42!' },
  { ssid: 'Guest-Portal', auth: false, password: '' },
  { ssid: 'Admin-Router', auth: true, password: 'admin!secure' },
  { ssid: 'Public-Library', auth: true, password: 'library!access' }
];

const MULLVAD_COUNTRIES = [
  { country: 'United States', code: 'us' },
  { country: 'Canada', code: 'ca' },
  { country: 'Germany', code: 'de' },
  { country: 'Netherlands', code: 'nl' },
  { country: 'United Kingdom', code: 'gb' },
  { country: 'Switzerland', code: 'ch' },
  { country: 'Japan', code: 'jp' },
  { country: 'Singapore', code: 'sg' },
  { country: 'Sweden', code: 'se' },
  { country: 'Australia', code: 'au' }
];

const COLORS = {
  '0': '#00ff9c', '1': '#ffffff', '2': '#39d0ff', '3': '#ff5cf1',
  '4': '#ffe600', '5': '#ff5f57', '6': '#5f8bff', '7': '#ff9f43',
  '8': '#a78bff', '9': '#9aa3b2'
};

/* commands that work with NO internet (bootstrap only) */
const NO_NET_OK = ['help', 'clear', 'net', 'internet', 'vpn', 'mullvad', 'whoami', 'version'];
/* commands that additionally require an active VPN */
const VPN_ONLY = ['install', 'bruce', 'nos', 'nmap', 'scan', 'crack', 'open', 'db', 'netcrack', 'transfer', 'leak'];

const ALL_COMMANDS = [
  'help', 'clear', 'whoami', 'users', 'store', 'balance', 'rank', 'top', 'leaderboard',
  'color', 'install', 'bruce', 'nos', 'nmap', 'open', 'db', 'net', 'internet', 'vpn',
  'mullvad', 'ping', 'neofetch', 'uptime', 'stats', 'echo', 'encrypt', 'decrypt',
  'fortune', 'history', 'matrix', 'sudo', 'theme', 'notify', 'afk', 'version', 'wipe'
];

/* ---------- helpers ---------- */
function esc(s) {
  var amp = String.fromCharCode(38);
  var lt = String.fromCharCode(60);
  var gt = String.fromCharCode(62);
  var quot = String.fromCharCode(34);
  var apos = String.fromCharCode(39);
  var map = {};
  map[amp] = '&' + 'amp;';
  map[lt] = '&' + 'lt;';
  map[gt] = '&' + 'gt;';
  map[quot] = '&' + 'quot;';
  map[apos] = '&' + '#39;';
  var str = String(s === undefined || s === null ? '' : s);
  return str.replace(/[&<>"']/g, function (m) { return map[m]; });
}
function defaultAvatar(name) {
  var c = encodeURIComponent((name || '?')[0].toUpperCase());
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="48" fill="#222"/><text x="48" y="62" font-size="44" text-anchor="middle" fill="#fff" font-family="monospace">' + c + '</text></svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
function rankOf(h) {
  if (h >= 10) return 'legend';
  if (h >= 7) return 'elite';
  if (h >= 5) return 'gold';
  if (h >= 3) return 'silver';
  if (h >= 1) return 'bronze';
  return 'rookie';
}
function incomeOf(h) {
  var r = rankOf(h);
  if (r === 'legend') return 50;
  if (r === 'elite') return 38;
  if (r === 'gold') return 28;
  if (r === 'silver') return 18;
  if (r === 'bronze') return 10;
  return 5;
}
function rankProgress(h) {
  var tiers = [[1, 'bronze'], [3, 'silver'], [5, 'gold'], [7, 'elite'], [10, 'legend']];
  for (var i = 0; i < tiers.length; i++) {
    if (h < tiers[i][0]) {
      var prev = i === 0 ? 0 : tiers[i - 1][0];
      var pct = ((h - prev) / (tiers[i][0] - prev)) * 100;
      return { pct: Math.max(0, Math.min(100, pct)), next: tiers[i][1], need: tiers[i][0] - h };
    }
  }
  return { pct: 100, next: 'legend', need: 0 };
}
function toast(t) {
  var el = $('toast');
  el.textContent = t;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.remove('show'); }, 2400);
}
function beep() {
  if (!soundOn) return;
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; o.type = 'sine';
    g.gain.setValueAtTime(0.05, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    o.start(); o.stop(ctx.currentTime + 0.18);
  } catch (e) {}
}

/* ---------- terminal ---------- */
var term = $('term');
var termInput = $('termInput');
function applyColor() { term.style.setProperty('--tc', COLORS[termColor] || COLORS['0']); }
applyColor();
function print(t, cls) {
  var div = document.createElement('div');
  div.className = 'l ' + (cls || '');
  div.textContent = t;
  term.appendChild(div);
  term.scrollTop = term.scrollHeight;
  return div;
}
function printHTML(html) {
  var div = document.createElement('div');
  div.className = 'l';
  div.innerHTML = html;
  term.appendChild(div);
  term.scrollTop = term.scrollHeight;
}
function repeat(s, n) { var o = ''; for (var i = 0; i < n; i++) o += s; return o; }
function progressBar(label, ms, done) {
  var line = document.createElement('div');
  line.className = 'l bar';
  term.appendChild(line);
  var start = Date.now();
  var iv = setInterval(function () {
    var p = Math.min(1, (Date.now() - start) / ms);
    var n = Math.floor(p * 24);
    line.textContent = label + ' [' + repeat('█', n) + repeat('░', 24 - n) + '] ' + Math.floor(p * 100) + '%';
    term.scrollTop = term.scrollHeight;
    if (p >= 1) { clearInterval(iv); if (done) done(); }
  }, 90);
}
function setLockBanner() {
  var b = $('lockBanner');
  if (!internet.connected) {
    b.classList.remove('hidden');
    $('lockText').textContent = 'OFFLINE - no internet connection. type: internet';
    $('netBtn').classList.add('off');
    $('vpnBtn').classList.add('off');
  } else if (!vpn.active) {
    b.classList.remove('hidden');
    $('lockText').textContent = 'ONLINE - vpn not active. type: vpn (install and hacking need vpn)';
    $('netBtn').classList.remove('off');
    $('vpnBtn').classList.add('off');
  } else {
    b.classList.add('hidden');
    $('netBtn').classList.remove('off');
    $('vpnBtn').classList.remove('off');
  }
}
function requireNet(c) {
  if (NO_NET_OK.indexOf(c) !== -1) return true;
  if (!internet.connected) {
    print('BLOCKED: no internet connection. type: internet', 'err');
    print('  every command needs the grid. connect to a network first.', 'dim');
    return false;
  }
  return true;
}
function requireVpn(c) {
  if (VPN_ONLY.indexOf(c) === -1) return true;
  if (!vpn.active) {
    print('BLOCKED: this command needs an active VPN.', 'err');
    print('  type: vpn  (free tunnel lasts 60 seconds)', 'dim');
    return false;
  }
  return true;
}

/* ---------- account ---------- */
function saveBackup() {
  try {
    if (!ME) return;
    localStorage.setItem('hc_backup', JSON.stringify({
      id: ME.id, name: ME.name, avatar: ME.avatar, host: ME.host,
      openPort: ME.openPort, balance: ME.balance, hacks: ME.hacks,
      mullvad: ME.mullvad,
      createdAt: ME.createdAt, serverPassword: localStorage.getItem('hc_pass') || ''
    }));
  } catch (e) {}
}
function getBackup() {
  try { return JSON.parse(localStorage.getItem('hc_backup') || 'null'); } catch (e) { return null; }
}
function renderMe() {
  if (!ME) return;
  saveBackup();
  $('meName').textContent = ME.name;
  $('meHost').textContent = ME.host;
  $('meBalance').textContent = ME.balance;
  $('meAvatar').src = ME.avatar || defaultAvatar(ME.name);
  var r = $('meRank');
  r.textContent = rankOf(ME.hacks);
  r.className = 'rank-badge ' + rankOf(ME.hacks);
  $('selfHostBox').textContent = 'server: ' + ME.host + '  port: ' + (ME.openPort || '???') +
    '  income: ' + incomeOf(ME.hacks) + '$/10s  hacks: ' + ME.hacks;
  var p = rankProgress(ME.hacks);
  $('pfProgFill').style.width = p.pct + '%';
  $('pfProgText').textContent = p.need > 0 ? (p.need + ' more hacks to reach ' + p.next) : 'max rank reached';
  if (ME.mullvad) $('mullvadBtn').classList.remove('hidden');
}
function refreshMe() {
  if (!ME) return;
  fetch('/api/me/' + ME.id).then(function (r) { return r.json(); }).then(function (j) {
    if (j && !j.error) { ME = j; renderMe(); }
  }).catch(function () {});
}
function enterApp() {
  renderMe();
  socket.emit('presence:online', { userId: ME.id });
  socket.on('balance:' + ME.id, function (d) {
    ME.balance = d.balance;
    $('meBalance').textContent = d.balance;
    saveBackup();
  });
}
function sendTabState() {
  if (socket && ME) socket.emit('tab:active', { userId: ME.id, active: !document.hidden });
}
document.addEventListener('visibilitychange', function () { sendTabState(); });

/* ---------- chat ---------- */
function msgEl(m) {
  var mine = ME && m.userId === ME.id;
  var d = document.createElement('div');
  d.className = 'msg' + (mine ? ' mine' : '');
  var av = m.avatar || defaultAvatar(m.name);
  d.innerHTML = '<img class="av" src="' + esc(av) + '"/><div class="bubble"><div class="who">' +
    esc(m.name) + ' <time>' + new Date(m.ts).toLocaleTimeString() + '</time></div><div class="text">' +
    esc(m.text) + '</div></div>';
  d.querySelector('.av').onclick = function () { openProfile(m.userId); };
  d.querySelector('.who').onclick = function () { openProfile(m.userId); };
  if (m.image) {
    var im = document.createElement('img');
    im.className = 'photo'; im.src = m.image; im.loading = 'lazy';
    d.querySelector('.bubble').appendChild(im);
  }
  if (!m.text) d.querySelector('.text').remove();
  return d;
}
function addMsg(m) {
  var box = $('messages');
  box.appendChild(msgEl(m));
  while (box.children.length > 200) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
  if (ME && m.userId !== ME.id) beep();
}
socket.on('chat:history', function (arr) { $('messages').innerHTML = ''; arr.forEach(addMsg); });
socket.on('chat:message', function (m) {
  addMsg(m);
  if (ME && m.userId !== ME.id) {
    try { Notification.requestPermission(); new Notification('HackChat', { body: m.name + ': ' + (m.text || '[photo]') }); } catch (e) {}
  }
});
socket.on('typing', function (d) {
  if (!ME || d.userId === ME.id) return;
  $('typingName').textContent = d.name;
  $('typing').classList.remove('hidden');
  clearTimeout($('typing')._t);
  $('typing')._t = setTimeout(function () { $('typing').classList.add('hidden'); }, 2500);
});
socket.on('users:list', function (arr) {
  usersById = {};
  arr.forEach(function (u) { usersById[u.id] = u; });
  $('onlineCount').textContent = arr.filter(function (u) { return u.online; }).length + ' online';
  if (ME && usersById[ME.id]) {
    ME.balance = usersById[ME.id].balance;
    ME.hacks = usersById[ME.id].hacks;
    ME.name = usersById[ME.id].name;
    ME.avatar = usersById[ME.id].avatar;
    ME.mullvad = usersById[ME.id].mullvad;
    renderMe();
  }
});
socket.on('user:banned', function (d) {
  if (ME && d.id === ME.id) {
    localStorage.removeItem('hc_id');
    localStorage.removeItem('hc_backup');
    toast('you were banned - reloading fresh');
    setTimeout(function () { location.reload(); }, 1400);
  }
});
function sendText() {
  var t = $('msgInput').value.trim();
  if (!t) return;
  if (!internet.connected) { toast('no internet connection - type: internet'); return; }
  if (!ME) return;
  $('msgInput').value = '';
  socket.emit('chat:message', { userId: ME.id, text: t }, function (ack) {
    if (ack && ack.error) toast(ack.error);
  });
}
$('sendBtn').onclick = sendText;
$('msgInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') sendText(); });
$('msgInput').addEventListener('input', function () {
  if (ME) socket.emit('typing', { userId: ME.id, name: ME.name });
});
function fileToDataUrl(file, max) {
  max = max || 800;
  return new Promise(function (res, rej) {
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      var scale = Math.min(1, max / Math.max(img.width, img.height));
      var cv = document.createElement('canvas');
      cv.width = img.width * scale;
      cv.height = img.height * scale;
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      res(cv.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = rej;
    img.src = url;
  });
}
$('imgInput').onchange = function (e) {
  var f = e.target.files[0];
  if (!f || !ME) return;
  if (!internet.connected) { toast('no internet connection'); e.target.value = ''; return; }
  fileToDataUrl(f).then(function (data) {
    socket.emit('chat:message', { userId: ME.id, text: '', image: data });
  });
  e.target.value = '';
};

/* ---------- profile ---------- */
function openProfile(userId) {
  var u = usersById[userId];
  if (!u) return;
  $('profilePane').classList.remove('hidden');
  $('pfAvatar').src = u.avatar || defaultAvatar(u.name);
  $('pfName').textContent = u.name;
  $('pfRank').textContent = u.rank;
  $('pfHost').textContent = u.host;
  $('pfBalance').textContent = u.balance + '$';
  $('pfHacks').textContent = u.hacks;
  $('pfMining').textContent = incomeOf(u.hacks) + '$/10s';
  var p = rankProgress(u.hacks);
  $('pfProgFill').style.width = p.pct + '%';
  $('pfProgText').textContent = p.need > 0 ? (p.need + ' more hacks to reach ' + p.next) : 'max rank reached';
  var self = ME && userId === ME.id;
  $('pfSelf').classList.toggle('hidden', !self);
  if (self) { $('editName').value = ME.name; refreshMe(); }
}
$('profileBack').onclick = function () { $('profilePane').classList.add('hidden'); };
$('myProfileBtn').onclick = function () { if (ME) openProfile(ME.id); };
$('mePill').onclick = function () { if (ME) openProfile(ME.id); };
$('saveName').onclick = function () {
  var v = $('editName').value.trim();
  if (!v || !ME) return;
  fetch('/api/me/' + ME.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: v }) })
    .then(function () { toast('name updated'); refreshMe(); });
};
$('saveAvatar').onclick = function () {
  var v = $('avatarUrl').value.trim();
  if (!v || !ME) return;
  fetch('/api/me/' + ME.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ avatar: v }) })
    .then(function () { toast('avatar updated'); refreshMe(); });
};
$('avatarFile').onchange = function (e) {
  var f = e.target.files[0];
  if (!f || !ME) return;
  fileToDataUrl(f, 256).then(function (data) {
    fetch('/api/me/' + ME.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ avatar: data }) })
      .then(function () { toast('avatar updated'); refreshMe(); });
  });
  e.target.value = '';
};
$('wipeBtn').onclick = function () {
  if (!confirm('Wipe local account data? You will start a brand new account.')) return;
  ['hc_id', 'hc_backup', 'hc_pass', 'hc_installed', 'hc_history'].forEach(function (k) { localStorage.removeItem(k); });
  location.reload();
};

/* ---------- network UI ---------- */
var selectedNet = null;
function renderNetList() {
  var box = $('netNetworks');
  box.innerHTML = '';
  NETWORKS.forEach(function (n) {
    var el = document.createElement('div');
    el.className = 'net-item';
    var tag = n.auth ? '<span class="lock">locked</span>' : '<span class="lock">open</span>';
    el.innerHTML = '<span>' + esc(n.ssid) + '</span>' + tag;
    el.onclick = function () {
      selectedNet = n;
      $('netPassRow').classList.toggle('hidden', !n.auth);
      Array.prototype.forEach.call(box.children, function (c) { c.classList.remove('sel'); });
      el.classList.add('sel');
    };
    box.appendChild(el);
  });
}
$('netBtn').onclick = function () {
  renderNetList();
  $('netResult').textContent = '';
  $('netResult').className = 'net-result';
  $('netModal').classList.remove('hidden');
};
$('netCancelBtn').onclick = function () { $('netModal').classList.add('hidden'); };
$('netCloseBtn').onclick = function () { $('netModal').classList.add('hidden'); };
$('netConnectBtn').onclick = function () {
  if (!selectedNet) { $('netResult').textContent = 'select a network first'; $('netResult').className = 'net-result err'; return; }
  var pw = $('netPassInput').value;
  print('connecting to ' + selectedNet.ssid + ' ...', 'dim');
  progressBar('handshake', 1800, function () {
    if (!selectedNet.auth || pw === selectedNet.password) {
      internet.connected = true;
      internet.ssid = selectedNet.ssid;
      $('netDot').classList.add('on');
      $('netResult').textContent = 'connected - signal excellent';
      $('netResult').className = 'net-result ok';
      print('internet connected: ' + selectedNet.ssid, 'ok');
      print('grid access restored. type: vpn for protected operations.', 'dim');
      setLockBanner();
      setTimeout(function () { $('netModal').classList.add('hidden'); }, 900);
    } else {
      $('netResult').textContent = 'wrong password';
      $('netResult').className = 'net-result err';
      print('wrong password for ' + selectedNet.ssid, 'err');
      print('hint: use netcrack to brute force this network', 'dim');
    }
  });
};

/* ---------- VPN ---------- */
function startVpnTimer() {
  clearInterval(vpn.timer);
  var left = 60;
  vpn.timer = setInterval(function () {
    left -= 1;
    $('vpnInfo').textContent = 'vpn active - ' + left + 's remaining';
    if (left <= 0) {
      clearInterval(vpn.timer);
      vpn.active = false;
      $('vpnDot').classList.remove('vpn-on');
      $('vpnInfo').textContent = 'vpn tunnel closed';
      print('vpn tunnel closed (60s elapsed)', 'dim');
      setLockBanner();
    }
  }, 1000);
}
$('vpnBtn').onclick = function () {
  if (!internet.connected) { toast('connect to internet first'); return; }
  $('vpnModal').classList.remove('hidden');
  $('vpnInfo').textContent = vpn.active ? 'vpn active' : 'vpn offline';
};
$('vpnCloseBtn').onclick = function () { $('vpnModal').classList.add('hidden'); };
$('vpnConnectBtn').onclick = function () {
  if (!internet.connected) { toast('connect to internet first'); return; }
  if (vpn.mullvad) { connectMullvad(vpn.country || 'us'); $('vpnModal').classList.add('hidden'); return; }
  vpn.active = true;
  $('vpnDot').classList.add('vpn-on');
  startVpnTimer();
  $('vpnInfo').textContent = 'vpn active - 60s remaining';
  $('vpnModal').classList.add('hidden');
  setLockBanner();
  print('vpn tunnel established (free, 60 seconds)', 'ok');
};
$('vpnDisconnectBtn').onclick = function () {
  vpn.active = false;
  clearInterval(vpn.timer);
  $('vpnDot').classList.remove('vpn-on');
  $('vpnInfo').textContent = 'vpn offline';
  print('vpn disconnected', 'dim');
  setLockBanner();
};

/* ---------- mullvad ---------- */
function renderMullvadList() {
  var box = $('mullvadList');
  box.innerHTML = '';
  MULLVAD_COUNTRIES.forEach(function (c) {
    var el = document.createElement('div');
    el.className = 'net-item';
    el.innerHTML = '<span>' + esc(c.country) + '</span><span class="lock">' + esc(c.code.toUpperCase()) + '</span>';
    if (vpn.mullvad) {
      el.onclick = function () { connectMullvad(c.code); $('mullvadModal').classList.add('hidden'); };
    } else {
      el.style.opacity = '.45';
      el.style.cursor = 'not-allowed';
    }
    box.appendChild(el);
  });
  $('mullvadBuyRow').classList.toggle('hidden', vpn.mullvad);
}
function connectMullvad(code) {
  var c = MULLVAD_COUNTRIES.filter(function (x) { return x.code === code; })[0];
  vpn.active = true;
  vpn.mullvad = true;
  vpn.country = code;
  $('vpnDot').classList.add('vpn-on');
  $('mullvadBtn').classList.remove('hidden');
  setLockBanner();
  print('mullvad vpn connected to ' + (c ? c.country : code), 'ok');
  toast('vpn active: ' + (c ? c.country : code));
}
$('mullvadBtn').onclick = function () {
  if (!vpn.mullvad) {
    if (!internet.connected) { toast('connect to internet first'); return; }
    print('mullvad client not found. type: install mullvad', 'dim');
    toast('type install mullvad in terminal');
    return;
  }
  renderMullvadList();
  $('mullvadModal').classList.remove('hidden');
};
$('mullvadCloseBtn').onclick = function () { $('mullvadModal').classList.add('hidden'); };
$('mullvadXBtn').onclick = function () { $('mullvadModal').classList.add('hidden'); };
$('mullvadBuyBtn').onclick = function () {
  if (!ME) return;
  if (ME.balance < 10000) { toast('need 10000$ - you have ' + ME.balance + '$'); return; }
  fetch('/api/buy-mullvad', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: ME.id }) })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (j.error) { toast(j.error); return; }
      ME.balance = j.balance;
      ME.mullvad = true;
      renderMe();
      vpn.mullvad = true;
      renderMullvadList();
      print('mullvad vpn purchased - permanent access unlocked', 'ok');
      toast('mullvad vpn purchased!');
    });
};

/* ---------- leaderboard ---------- */
$('rankBtn').onclick = function () {
  $('rankModal').classList.remove('hidden');
  var box = $('rankList');
  box.innerHTML = 'loading...';
  fetch('/api/leaderboard').then(function (r) { return r.json(); }).then(function (list) {
    box.innerHTML = '';
    list.forEach(function (u, i) {
      var el = document.createElement('div');
      el.className = 'lb-row';
      el.innerHTML = '<span class="lb-pos">' + (i + 1) + '</span><img src="' + esc(u.avatar || defaultAvatar(u.name)) +
        '"/><span class="grow">' + esc(u.name) + '<br><span class="dim mono" style="font-size:11px">' + esc(u.host) +
        ' - ' + u.hacks + ' hacks</span></span><span class="lb-rank">' + esc(u.rank) + '</span><span class="lb-bal">' + u.balance + '$</span>';
      box.appendChild(el);
    });
  });
};
$('rankCloseBtn').onclick = function () { $('rankModal').classList.add('hidden'); };
$('rankDismissBtn').onclick = function () { $('rankModal').classList.add('hidden'); };

/* ---------- sound ---------- */
$('soundBtn').onclick = function () {
  soundOn = !soundOn;
  localStorage.setItem('hc_sound', soundOn ? '1' : '0');
  $('soundIcon').innerHTML = soundOn ? '&#128266;' : '&#128263;';
  toast(soundOn ? 'sound on' : 'sound off');
};

/* ---------- matrix rain ---------- */
function matrixRain() {
  if (matrixTimer) return;
  var cv = document.createElement('canvas');
  cv.className = 'matrix-canvas';
  document.body.appendChild(cv);
  var ctx = cv.getContext('2d');
  var cols = [];
  function resize() {
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    cols = Math.floor(cv.width / 16);
  }
  resize();
  window.addEventListener('resize', resize);
  var drops = [];
  for (var i = 0; i < cols; i++) drops[i] = Math.random() * -50;
  matrixTimer = setInterval(function () {
    ctx.fillStyle = 'rgba(0,0,0,.08)';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.font = '14px monospace';
    for (var j = 0; j < cols; j++) {
      var ch = Math.random() < 0.5 ? '0' : '1';
      ctx.fillStyle = '#00ff9c';
      ctx.fillText(ch, j * 16, drops[j] * 16);
      ctx.fillStyle = '#39d0ff';
      ctx.fillText(ch, j * 16, (drops[j] - 1) * 16);
      drops[j]++;
      if (drops[j] * 16 > cv.height && Math.random() > 0.975) drops[j] = 0;
    }
  }, 50);
  print('matrix rain engaged. type: matrix again to stop.', 'ok');
}
function matrixStop() {
  if (!matrixTimer) { print('matrix rain not running', 'dim'); return; }
  clearInterval(matrixTimer);
  matrixTimer = null;
  var cvs = document.querySelectorAll('.matrix-canvas');
  for (var i = 0; i < cvs.length; i++) cvs[i].remove();
  print('matrix rain stopped', 'dim');
}

/* ---------- terminal commands ---------- */
function bootTerm() {
  print('HACKCHAT ROOT TERMINAL v0.2 - type help', 'info');
  print('----------------------------------------', 'dim');
  print('no internet? type: internet', 'warn');
}
function handleCommand(raw) {
  if (!raw) return;
  var parts = raw.split(/\s+/);
  var c = parts[0].toLowerCase();
  var arg = parts.slice(1).join(' ');

  if (!requireNet(c)) return;
  if (!requireVpn(c)) return;

  if (c === 'help') {
    print('=== HackChat v0.2 commands ===', 'info');
    print('-- basic --', 'dim');
    print('  help          this list');
    print('  clear         clear the screen');
    print('  whoami        your identity');
    print('  version       version info');
    print('  history       command history');
    print('-- account --', 'dim');
    print('  users         list all users');
    print('  store/balance your balance and rank');
    print('  rank [host]   rank of a user');
    print('  top           leaderboard');
    print('  stats         server stats');
    print('  uptime        server uptime');
    print('-- network --', 'dim');
    print('  internet/net  connect to internet');
    print('  vpn           open vpn deck');
    print('  mullvad       open mullvad deck');
    print('  ping [host]   ping a host');
    print('-- tools (VPN required) --', 'dim');
    print('  install [pkg] bruce, nos, mullvad');
    print('  bruce         password engine');
    print('  nos / nmap    port scanner');
    print('  open [path]   open remote core');
    print('  db open       admin control deck');
    print('-- fun --', 'dim');
    print('  neofetch      system info');
    print('  fortune       random fortune');
    print('  echo [txt]    echo text');
    print('  encrypt [txt] base64 encode');
    print('  decrypt [txt] base64 decode');
    print('  matrix        matrix rain');
    print('  theme         toggle theme');
    print('  notify        test notification');
    print('  afk           toggle away mode');
    print('  sudo [cmd]    run with privileges');
    print('  wipe          wipe local account');
    return;
  }
  if (c === 'clear') { term.innerHTML = ''; return; }
  if (c === 'version') {
    print('HackChat v0.2 (build 2026.11)', 'ok');
    print('terminal v0.2 - node ' + (navigator.userAgent.indexOf('Chrome') > -1 ? 'chromium' : 'web'), 'dim');
    return;
  }
  if (c === 'history') {
    print('-- command history --', 'info');
    cmdHistory.slice(-25).forEach(function (h, i) { print('  ' + (i + 1) + '. ' + h); });
    return;
  }
  if (c === 'whoami') {
    print(ME ? ME.name + ' :: ' + ME.host + ' :: ' + ME.balance + '$ :: ' + rankOf(ME.hacks) : 'ghost', 'ok');
    return;
  }
  if (c === 'users' || c === 'lsusers') {
    var list = Object.keys(usersById).map(function (k) { return usersById[k]; });
    print('-- ' + list.length + ' nodes on the grid --', 'info');
    list.forEach(function (u) {
      print('  ' + u.host + ' :: ' + u.name + ' :: ' + u.balance + '$ :: ' + u.rank + (u.online ? ' :: online' : ''));
    });
    return;
  }
  if (c === 'store' || c === 'balance' || c === 'bal') {
    var p = rankProgress(ME ? ME.hacks : 0);
    print('balance: ' + (ME ? ME.balance : 0) + '$', 'ok');
    print('hacks: ' + (ME ? ME.hacks : 0) + '  rank: ' + rankOf(ME ? ME.hacks : 0), 'dim');
    print('income: ' + incomeOf(ME ? ME.hacks : 0) + '$/10s  (only while tab is open)', 'dim');
    print('progress: ' + Math.floor(p.pct) + '%' + (p.need > 0 ? (' - ' + p.need + ' hacks to ' + p.next) : ' - max rank'), 'dim');
    return;
  }
  if (c === 'rank') {
    if (!arg) { print('usage: rank HC-XXXX-XXXX', 'info'); return; }
    fetch('/api/rank/' + encodeURIComponent(arg)).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { print('host does not exist.', 'err'); return; }
        var j = res.j;
        print(j.name + ' :: ' + j.host, 'ok');
        print('  rank: ' + j.rank + '  hacks: ' + j.hacks + '  balance: ' + j.balance + '$  income: ' + j.income + '$/10s', 'dim');
        print('  status: ' + (j.online ? 'online' : 'offline'), 'dim');
      });
    return;
  }
  if (c === 'top' || c === 'leaderboard') {
    fetch('/api/leaderboard').then(function (r) { return r.json(); }).then(function (rows) {
      print('-- leaderboard --', 'info');
      rows.forEach(function (u, i) {
        print('  ' + (i + 1) + '. ' + u.name + ' :: ' + u.balance + '$ :: ' + u.rank + ' :: ' + u.hacks + ' hacks');
      });
    });
    return;
  }
  if (c === 'stats') {
    fetch('/api/stats').then(function (r) { return r.json(); }).then(function (s) {
      print('-- server stats --', 'info');
      print('  version: ' + s.version, 'dim');
      print('  uptime: ' + Math.floor(s.uptime / 60) + 'm ' + (s.uptime % 60) + 's', 'dim');
      print('  users: ' + s.users + '  online: ' + s.online, 'dim');
      print('  messages: ' + s.messages, 'dim');
      print('  storage: ' + s.mongo, 'dim');
    });
    return;
  }
  if (c === 'uptime') {
    fetch('/api/stats').then(function (r) { return r.json(); }).then(function (s) {
      print('server uptime: ' + Math.floor(s.uptime / 3600) + 'h ' + Math.floor((s.uptime % 3600) / 60) + 'm', 'ok');
    });
    return;
  }
  if (c === 'color') {
    if (!COLORS[arg]) {
      print('usage: color [0-9]  0 green 1 white 2 cyan 3 magenta 4 yellow 5 red 6 blue 7 orange 8 purple 9 gray', 'err');
      return;
    }
    termColor = arg;
    localStorage.setItem('hc_term_color', arg);
    applyColor();
    print('terminal color set to ' + arg, 'ok');
    return;
  }
  if (c === 'net' || c === 'internet') { $('netBtn').click(); return; }
  if (c === 'vpn') { $('vpnBtn').click(); return; }
  if (c === 'mullvad') { $('mullvadBtn').click(); return; }
  if (c === 'ping') {
    var t0 = Date.now();
    var target = arg || (ME ? ME.host : 'localhost');
    fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: target }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        var ms = Date.now() - t0;
        if (!res.ok) { print('ping: ' + target + ' - host not found (' + ms + 'ms)', 'err'); return; }
        print('ping ' + target + ': ' + ms + 'ms  ttl=64  host=' + res.j.host, 'ok');
      });
    return;
  }
  if (c === 'neofetch') {
    print('       _                  user   ' + (ME ? ME.name : 'guest'), 'info');
    print('  ___ | |__   ___ _ __  host   ' + (ME ? ME.host : '-'), 'info');
    print(" / _ \\| '_ \\ / _ \\ '_ \\  rank   " + rankOf(ME ? ME.hacks : 0), 'info');
    print('|  __/| | | |  __/ | | | balance ' + (ME ? ME.balance : 0) + '$', 'info');
    print(' \\___||_| |_|\\___|_| |_| net    ' + (internet.connected ? internet.ssid : 'offline'), 'info');
    print('                              vpn    ' + (vpn.active ? 'active' : 'offline'), 'info');
    return;
  }
  if (c === 'fortune') {
    var fs = ['A journey of a thousand hacks begins with a single port.', 'The best defense is a VPN and a long password.', 'Trust no one. Scan everything.', 'Your rank is earned one breach at a time.', 'Legends mine faster.', 'Patience cracks passwords.', 'The grid always answers.'];
    print(fs[Math.floor(Math.random() * fs.length)], 'info');
    return;
  }
  if (c === 'echo') { print(arg, 'info'); return; }
  if (c === 'encrypt') {
    if (!arg) { print('usage: encrypt [text]', 'info'); return; }
    print(btoa(unescape(encodeURIComponent(arg))), 'ok');
    return;
  }
  if (c === 'decrypt') {
    if (!arg) { print('usage: decrypt [base64]', 'info'); return; }
    try { print(decodeURIComponent(escape(atob(arg))), 'ok'); }
    catch (e) { print('not valid base64', 'err'); }
    return;
  }
  if (c === 'matrix') {
    if (matrixTimer) matrixStop(); else matrixRain();
    return;
  }
  if (c === 'theme') {
    if (arg === 'light') {
      document.body.style.setProperty('--bg', '#f2f2f4');
      document.body.style.setProperty('--panel', '#ffffff');
      document.body.style.setProperty('--txt', '#0a0a0c');
      document.body.style.setProperty('--line', '#d0d0d8');
      print('theme: light', 'ok');
    } else {
      document.body.style.setProperty('--bg', '#060607');
      document.body.style.setProperty('--panel', '#0e0e11');
      document.body.style.setProperty('--txt', '#f2f2f4');
      document.body.style.setProperty('--line', '#232329');
      print('theme: dark', 'ok');
    }
    return;
  }
  if (c === 'notify') {
    try { Notification.requestPermission().then(function (p) { if (p === 'granted') new Notification('HackChat', { body: 'notification test ok' }); }); print('notification sent', 'ok'); }
    catch (e) { print('notifications not available', 'err'); }
    return;
  }
  if (c === 'afk') {
    if (ME) {
      ME.afk = !ME.afk;
      print(ME.afk ? 'away mode on - you will not get pinged' : 'away mode off', 'ok');
      $('meHost').textContent = ME.afk ? ME.host + ' (afk)' : ME.host;
    }
    return;
  }
  if (c === 'sudo') {
    if (!arg) { print('usage: sudo [command]', 'info'); return; }
    if (arg === 'rm') { print('sudo: nice try.', 'err'); print('  that command would delete the grid. denied.', 'dim'); return; }
    print('[sudo] password for ' + (ME ? ME.name : 'guest') + ': ', 'info');
    print('  access denied. you are not root.', 'err');
    return;
  }
  if (c === 'wipe') {
    if (!confirm('Wipe local account data? You will start a brand new account.')) return;
    ['hc_id', 'hc_backup', 'hc_pass', 'hc_installed', 'hc_history'].forEach(function (k) { localStorage.removeItem(k); });
    location.reload();
    return;
  }
  if (c === 'install') {
    var pkg = arg.toLowerCase();
    if (pkg === 'mullvad') {
      $('mullvadBtn').classList.remove('hidden');
      print('fetching mullvad vpn client from grid mirror...', 'dim');
      progressBar('installing mullvad', 2200, function () {
        print('mullvad installed. click the MUL button in the top bar.', 'ok');
        renderMullvadList();
        $('mullvadModal').classList.remove('hidden');
      });
      return;
    }
    if (pkg !== 'bruce' && pkg !== 'nos') { print('packages: bruce, nos, mullvad', 'err'); return; }
    if (installed[pkg]) { print(pkg + ' already installed. type ' + pkg + ' to run.', 'ok'); return; }
    print('fetching ' + pkg + ' from grid mirror...', 'dim');
    progressBar('installing ' + pkg, 2200, function () {
      installed[pkg] = true;
      localStorage.setItem('hc_installed', JSON.stringify(installed));
      print(pkg + ' installed. type ' + pkg + ' to launch.', 'ok');
    });
    return;
  }
  if (c === 'bruce' || c === 'crack') {
    if (!installed.bruce) { print('bruce not installed. type: install bruce', 'err'); return; }
    print('== BRUCE v4.2 // db password engine ==', 'info');
    print('  1 - start');
    print('  2 - quit');
    TSTATE = { mode: 'bruce_menu', data: {} };
    return;
  }
  if (c === 'nos' || c === 'nmap' || c === 'scan') {
    if (!installed.nos) { print('nos not installed. type: install nos', 'err'); return; }
    print('== NOS v1.9 // network port scanner ==', 'info');
    print('  1 - scan for ports');
    print('  2 - quit');
    TSTATE = { mode: 'nos_menu', data: {} };
    return;
  }
  if (c === 'netcrack') {
    print('== NETCRACK // wifi password engine ==', 'info');
    print('  1 - start');
    print('  2 - quit');
    TSTATE = { mode: 'netcrack_menu', data: {} };
    return;
  }
  if (c === 'open') {
    if (!arg) { print('usage: open [host]/[port]/core/[username]', 'err'); return; }
    TSTATE = { mode: 'open_password', data: { path: arg } };
    print('target locked: ' + arg, 'dim');
    print('enter server password:', 'info');
    return;
  }
  if (c === 'db' && arg.toLowerCase() === 'open') {
    TSTATE = { mode: 'db_password', data: {} };
    print('DATABASE deck requires password:', 'info');
    return;
  }
  print('unknown command: ' + c + '  (try help)', 'err');
}

/* ---------- terminal state machine ---------- */
function handleState(raw) {
  var m = TSTATE.mode;
  var d = TSTATE.data;

  if (m === 'netcrack_menu') {
    if (raw === '1') { TSTATE = { mode: 'netcrack_list', data: {} }; print('which network? (number or ssid):', 'info'); }
    else if (raw === '2') { TSTATE = { mode: 'idle', data: {} }; print('netcrack closed.', 'dim'); }
    else print('type 1 or 2', 'err');
    return;
  }
  if (m === 'netcrack_list') {
    var idx = parseInt(raw, 10);
    var net = NETWORKS[idx - 1];
    if (!net) net = NETWORKS.filter(function (x) { return x.ssid.toLowerCase() === raw.toLowerCase(); })[0];
    if (!net) { print('network not found.', 'err'); TSTATE = { mode: 'idle', data: {} }; return; }
    if (!net.auth) { print(net.ssid + ' is an open network. no password needed.', 'ok'); TSTATE = { mode: 'idle', data: {} }; return; }
    print('brute forcing ' + net.ssid + ' ...', 'dim');
    progressBar('cracking wifi', 3000, function () {
      print('PASSWORD CRACKED:', 'ok');
      print('  >>> ' + net.password + ' <<<', 'info');
      print('use it in the network deck.', 'dim');
      TSTATE = { mode: 'idle', data: {} };
    });
    return;
  }
  if (m === 'bruce_menu') {
    if (raw === '1') { TSTATE = { mode: 'bruce_port', data: {} }; print('target db port (4 digits):', 'info'); }
    else if (raw === '2') { TSTATE = { mode: 'idle', data: {} }; print('bruce closed.', 'dim'); }
    else print('type 1 or 2', 'err');
    return;
  }
  if (m === 'bruce_port') {
    print('resolving port...', 'dim');
    fetch('/api/bruce-init', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: raw })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { print('port does not exist.', 'err'); TSTATE = { mode: 'idle', data: {} }; return; }
        var j = res.j;
        d.port = raw; d.host = j.host; d.username = j.username; d.duration = j.duration;
        TSTATE = { mode: 'bruce_running', data: d };
        print('target: ' + j.host + ' :: ' + j.username, 'info');
        print('estimated time: ~' + j.duration + 's (adaptive to password strength)', 'info');
        runCrack(d);
      }).catch(function () { print('network error', 'err'); TSTATE = { mode: 'idle', data: {} }; });
    return;
  }
  if (m === 'bruce_result') {
    if (raw === '1') {
      var p = d.host + '/' + d.port + '/core/' + d.username;
      print('path copied: open ' + p, 'ok');
      if (navigator.clipboard) navigator.clipboard.writeText('open ' + p).catch(function () {});
      TSTATE = { mode: 'idle', data: {} };
    } else if (raw === '2') { TSTATE = { mode: 'idle', data: {} }; print('bruce closed.', 'dim'); }
    else print('type 1 or 2', 'err');
    return;
  }
  if (m === 'nos_menu') {
    if (raw === '1') { TSTATE = { mode: 'nos_host', data: {} }; print('target host (e.g. HC-XXXX-XXXX):', 'info'); }
    else if (raw === '2') { TSTATE = { mode: 'idle', data: {} }; print('nos closed.', 'dim'); }
    else print('type 1 or 2', 'err');
    return;
  }
  if (m === 'nos_host') {
    print('scanning ' + raw + ' ...', 'dim');
    TSTATE = { mode: 'nos_scanning', data: {} };
    fetch('/api/scan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: raw })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { print('host does not exist.', 'err'); TSTATE = { mode: 'idle', data: {} }; return; }
        var j = res.j;
        print('host ' + j.host + ' (' + j.username + ') - ' + j.ports.length + ' ports:', 'ok');
        j.ports.forEach(function (p) { print('  ' + p.port + '  ....  ' + p.status.toUpperCase(), p.status === 'open' ? 'ok' : 'err'); });
        print('copy the OPEN port into bruce.', 'info');
        TSTATE = { mode: 'idle', data: {} };
      }).catch(function () { print('network error', 'err'); TSTATE = { mode: 'idle', data: {} }; });
    return;
  }
  if (m === 'nos_scanning') { print('(scan in progress...)', 'dim'); return; }
  if (m === 'open_password') {
    fetch('/api/server-auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: d.path, password: raw })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) {
          print(res.j.error === 'WRONG_PASSWORD' ? 'wrong password.' : 'path or port does not exist.', 'err');
          TSTATE = { mode: 'idle', data: {} };
          return;
        }
        d.session = res.j;
        TSTATE = { mode: 'server_menu', data: d };
        print('Welcome ' + res.j.username, 'ok');
        print('  1 - balance');
        print('  2 - quit');
      }).catch(function () { print('network error', 'err'); TSTATE = { mode: 'idle', data: {} }; });
    return;
  }
  if (m === 'server_menu') {
    if (raw === '1') {
      TSTATE = { mode: 'server_balance', data: d };
      print('balance of ' + d.session.username + ': ' + d.session.balance + '$', 'ok');
      print('  1 - transfer');
      print('  2 - leak (wipe to 0)');
      print('  3 - quit');
    } else if (raw === '2') { TSTATE = { mode: 'idle', data: {} }; print('connection closed.', 'dim'); }
    else print('type 1 or 2', 'err');
    return;
  }
  if (m === 'server_balance') {
    if (raw === '1') { TSTATE = { mode: 'transfer_host', data: d }; print('destination host:', 'info'); }
    else if (raw === '2') {
      fetch('/api/leak', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromHost: d.session.host, byId: ME ? ME.id : null })
      }).then(function () {
        print('balance leaked. server wiped to 0$. hacks +1.', 'ok');
        refreshMe();
      });
      TSTATE = { mode: 'idle', data: {} };
    } else if (raw === '3') { TSTATE = { mode: 'idle', data: {} }; print('connection closed.', 'dim'); }
    else print('type 1, 2 or 3', 'err');
    return;
  }
  if (m === 'transfer_host') {
    fetch('/api/transfer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromHost: d.session.host, toHost: raw, byId: ME ? ME.id : null })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { print('destination host does not exist.', 'err'); TSTATE = { mode: 'idle', data: {} }; return; }
        print('transferred ' + res.j.moved + '$ to ' + raw + '. hacks +1.', 'ok');
        refreshMe();
        TSTATE = { mode: 'idle', data: {} };
      }).catch(function () { print('network error', 'err'); TSTATE = { mode: 'idle', data: {} }; });
    return;
  }
  if (m === 'db_password') {
    fetch('/api/admin/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: raw })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { print('access denied.', 'err'); TSTATE = { mode: 'idle', data: {} }; return; }
        adminToken = res.j.token;
        print('access granted. opening deck...', 'ok');
        openAdmin();
        TSTATE = { mode: 'idle', data: {} };
      }).catch(function () { print('network error', 'err'); TSTATE = { mode: 'idle', data: {} }; });
    return;
  }
  TSTATE = { mode: 'idle', data: {} };
}

function runCrack(d) {
  var total = d.duration;
  var line = document.createElement('div');
  line.className = 'l bar';
  term.appendChild(line);
  var guesses = ['moon', 'shadow', 'admin', 'dragon', 'trustno', 'qwert', 'letmein', 'sunshine', 'master', 'access'];
  var start = Date.now();
  var gi = 0;
  var iv = setInterval(function () {
    var el = (Date.now() - start) / 1000;
    var p = Math.min(1, el / total);
    var left = Math.max(0, Math.ceil(total - el));
    var n = Math.floor(p * 24);
    line.textContent = 'guessing [' + repeat('█', n) + repeat('░', 24 - n) + '] ' + Math.floor(p * 100) +
      '%  ~' + left + 's left  try: ' + guesses[gi++ % guesses.length] + Math.floor(Math.random() * 999);
    term.scrollTop = term.scrollHeight;
    if (p >= 1) {
      clearInterval(iv);
      fetch('/api/bruce-reveal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: d.port })
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) { print('port does not exist.', 'err'); TSTATE = { mode: 'idle', data: {} }; return; }
          d.password = res.j.password;
          print('PASSWORD CRACKED:', 'ok');
          print('  >>> ' + res.j.password + ' <<<', 'info');
          print('owner: ' + res.j.username + ' @ ' + res.j.host, 'dim');
          print('  1 - copy path');
          print('  2 - quit');
          TSTATE = { mode: 'bruce_result', data: d };
        }).catch(function () { print('network error', 'err'); TSTATE = { mode: 'idle', data: {} }; });
    }
  }, 200);
}

/* ---------- admin ---------- */
function openAdmin() {
  $('adminWrap').classList.remove('hidden');
  loadAdmin();
}
$('adminClose').onclick = function () { $('adminWrap').classList.add('hidden'); };
function loadAdmin() {
  var box = $('adminList');
  box.innerHTML = 'loading...';
  fetch('/api/admin/users?token=' + encodeURIComponent(adminToken))
    .then(function (r) { return r.json(); })
    .then(function (users) {
      box.innerHTML = '';
      users.forEach(function (u) {
        var row = document.createElement('div');
        row.className = 'admin-row';
        row.innerHTML = '<img src="' + esc(u.avatar || defaultAvatar(u.name)) + '"/><div class="grow"><b>' +
          esc(u.name) + '</b><div style="font-size:12px">' + esc(u.host) + ' - ' + esc(u.rank) + ' - ' +
          u.hacks + ' hacks</div></div>';
        var inp = document.createElement('input');
        inp.type = 'number';
        inp.value = u.balance;
        var set = document.createElement('button');
        set.className = 'btn-set'; set.textContent = 'set $';
        set.onclick = function () {
          fetch('/api/admin/set-balance', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: adminToken, userId: u.id, balance: Number(inp.value) })
          }).then(function () { toast('balance updated'); loadAdmin(); });
        };
        var ban = document.createElement('button');
        ban.className = 'btn-ban'; ban.textContent = 'ban';
        ban.onclick = function () {
          if (!confirm('Ban ' + u.name + '? Their device account resets on next open.')) return;
          fetch('/api/admin/ban', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: adminToken, userId: u.id })
          }).then(function () { toast('user banned'); loadAdmin(); });
        };
        row.appendChild(inp);
        row.appendChild(set);
        row.appendChild(ban);
        box.appendChild(row);
      });
    });
}

/* ---------- terminal input: history + autocomplete ---------- */
termInput.addEventListener('keydown', function (e) {
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!cmdHistory.length) return;
    histIdx = histIdx < 0 ? cmdHistory.length - 1 : Math.max(0, histIdx - 1);
    termInput.value = cmdHistory[histIdx];
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (histIdx < 0) return;
    histIdx++;
    if (histIdx >= cmdHistory.length) { histIdx = -1; termInput.value = ''; }
    else termInput.value = cmdHistory[histIdx];
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    var v = termInput.value.toLowerCase();
    var match = ALL_COMMANDS.filter(function (x) { return x.indexOf(v) === 0; });
    if (match.length === 1) termInput.value = match[0];
    else if (match.length > 1) print(match.join('  '), 'dim');
    return;
  }
  if (e.key !== 'Enter') return;
  var raw = termInput.value;
  termInput.value = '';
  histIdx = -1;
  print('> ' + raw, 'info');
  if (raw.trim()) {
    cmdHistory.push(raw.trim());
    if (cmdHistory.length > 100) cmdHistory.shift();
    localStorage.setItem('hc_history', JSON.stringify(cmdHistory));
  }
  if (TSTATE.mode !== 'idle') handleState(raw.trim());
  else handleCommand(raw.trim());
});
termInput.addEventListener('input', function () {
  var v = termInput.value.toLowerCase().trim();
  var match = ALL_COMMANDS.filter(function (x) { return x.indexOf(v) === 0; });
  $('cmdSuggest').textContent = (v && match.length && match.length <= 3) ? match.join(' ') : '';
});

/* ---------- boot ---------- */
function boot() {
  bootTerm();
  try {
    var cached = JSON.parse(localStorage.getItem('hc_chat') || '[]');
    if (cached.length) { $('messages').innerHTML = ''; cached.forEach(addMsg); }
  } catch (e) {}
  setInterval(function () { fetch('/api/ping').catch(function () {}); }, 4 * 60 * 1000);
  setLockBanner();
  $('soundIcon').innerHTML = soundOn ? '&#128266;' : '&#128263;';
  var id = localStorage.getItem('hc_id');
  if (!id) { $('onboard').classList.remove('hidden'); return; }
  fetch('/api/check/' + id).then(function (r) { return r.json(); }).then(function (chk) {
    if (chk.banned) {
      ['hc_id', 'hc_backup', 'hc_pass', 'hc_installed'].forEach(function (k) { localStorage.removeItem(k); });
      installed = {};
      $('onboard').classList.remove('hidden');
      toast('account reset');
      return;
    }
    if (chk.exists) {
      fetch('/api/me/' + id).then(function (r) { return r.json(); }).then(function (j) {
        ME = j;
        enterApp();
        sendTabState();
        setInterval(sendTabState, 15000);
      });
      return;
    }
    var b = getBackup();
    if (b && b.serverPassword) {
      fetch('/api/account', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b)
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.error && !j.banned) {
          localStorage.setItem('hc_id', j.id);
          ME = j;
          saveBackup();
          print('session restored: ' + j.name + ' @ ' + j.host, 'ok');
          enterApp();
          sendTabState();
          setInterval(sendTabState, 15000);
          return;
        }
        $('onboard').classList.remove('hidden');
      }).catch(function () { $('onboard').classList.remove('hidden'); });
      return;
    }
    $('onboard').classList.remove('hidden');
  }).catch(function () { $('onboard').classList.remove('hidden'); });
}

$('obGo').onclick = function () {
  var name = $('obName').value.trim() || ('anon' + Math.floor(Math.random() * 9999));
  var pass = $('obPass').value;
  if (pass.length < 3) { toast('server password min 3 chars'); return; }
  var id = localStorage.getItem('hc_id') || (Math.random().toString(16).slice(2) + Date.now().toString(16));
  fetch('/api/account', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: id, name: name, avatar: defaultAvatar(name), serverPassword: pass })
  }).then(function (r) { return r.json(); }).then(function (j) {
    if (j.banned) { localStorage.removeItem('hc_id'); location.reload(); return; }
    if (j.error) { toast(j.error); return; }
    localStorage.setItem('hc_id', j.id);
    localStorage.setItem('hc_pass', pass);
    ME = j;
    saveBackup();
    $('onboard').classList.add('hidden');
    print('identity forged: ' + j.name + ' @ ' + j.host, 'ok');
    enterApp();
    sendTabState();
    setInterval(sendTabState, 15000);
  });
};

boot();