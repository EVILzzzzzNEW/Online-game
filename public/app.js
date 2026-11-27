/* HackChat v0.2 - Full feature set */
const $ = (id) => document.getElementById(id);
const socket = io();

let ME = null;
let usersById = {};
let installed = JSON.parse(localStorage.getItem('hc_installed') || '{}');
let termColor = localStorage.getItem('hc_term_color') || '0';
let TSTATE = { mode: 'idle', data: {} };
let adminToken = null;

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
function toast(t) {
  var el = $('toast');
  el.textContent = t;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.remove('show'); }, 2400);
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
function repeat(s, n) { var o = ''; for (var i = 0; i < n; i++) o += s; return o; }

/* ---------- account ---------- */
function saveBackup() {
  try {
    if (!ME) return;
    localStorage.setItem('hc_backup', JSON.stringify({
      id: ME.id, name: ME.name, avatar: ME.avatar, host: ME.host,
      openPort: ME.openPort, balance: ME.balance, hacks: ME.hacks,
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
}
socket.on('chat:history', function (arr) { $('messages').innerHTML = ''; arr.forEach(addMsg); });
socket.on('chat:message', addMsg);
socket.on('users:list', function (arr) {
  usersById = {};
  arr.forEach(function (u) { usersById[u.id] = u; });
  $('onlineCount').textContent = arr.length + ' online';
  if (ME && usersById[ME.id]) {
    ME.balance = usersById[ME.id].balance;
    ME.hacks = usersById[ME.id].hacks;
    ME.name = usersById[ME.id].name;
    ME.avatar = usersById[ME.id].avatar;
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
  if (!t || !ME) return;
  $('msgInput').value = '';
  socket.emit('chat:message', { userId: ME.id, text: t }, function (ack) {
    if (ack && ack.error) toast(ack.error);
  });
}
$('sendBtn').onclick = sendText;
$('msgInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') sendText(); });
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
      setTimeout(function () { $('netModal').classList.add('hidden'); }, 900);
    } else {
      $('netResult').textContent = 'wrong password';
      $('netResult').className = 'net-result err';
      print('wrong password for ' + selectedNet.ssid, 'err');
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
    }
  }, 1000);
}
$('vpnBtn').onclick = function () {
  if (!internet.connected) { toast('connect to internet first'); return; }
  $('vpnModal').classList.remove('hidden');
  $('vpnInfo').textContent = vpn.active ? 'vpn active' : 'vpn offline';
};
$('vpnConnectBtn').onclick = function () {
  if (!internet.connected) { toast('connect to internet first'); return; }
  if (vpn.mullvad) { connectMullvad(vpn.country || 'us'); $('vpnModal').classList.add('hidden'); return; }
  vpn.active = true;
  $('vpnDot').classList.add('vpn-on');
  startVpnTimer();
  $('vpnInfo').textContent = 'vpn active - 60s remaining';
  $('vpnModal').classList.add('hidden');
  print('vpn tunnel established (free, 60 seconds)', 'ok');
};
$('vpnDisconnectBtn').onclick = function () {
  vpn.active = false;
  clearInterval(vpn.timer);
  $('vpnDot').classList.remove('vpn-on');
  $('vpnInfo').textContent = 'vpn offline';
  print('vpn disconnected', 'dim');
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
$('mullvadBuyBtn').onclick = function () {
  if (!ME) return;
  if (ME.balance < 10000) { toast('need 10000$ - you have ' + ME.balance + '$'); return; }
  fetch('/api/buy-mullvad', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: ME.id }) })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (j.error) { toast(j.error); return; }
      ME.balance = j.balance;
      renderMe();
      vpn.mullvad = true;
      $('mullvadBtn').classList.remove('hidden');
      renderMullvadList();
      print('mullvad vpn purchased - permanent access unlocked', 'ok');
      toast('mullvad vpn purchased!');
    });
};

/* ---------- terminal commands ---------- */
function bootTerm() {
  print('HACKCHAT ROOT TERMINAL v0.2 - type help', 'info');
  print('----------------------------------------', 'dim');
}
function handleCommand(raw) {
  if (!raw) return;
  var parts = raw.split(/\s+/);
  var c = parts[0].toLowerCase();
  var arg = parts.slice(1).join(' ');

  if (c === 'help') {
    print('commands:', 'info');
    print('  color [0-9]        change terminal color');
    print('  install [pkg]      packages: bruce, nos, mullvad');
    print('  bruce              password engine (1-start 2-quit)');
    print('  nos                port scanner (1-scan 2-quit)');
    print('  open [path]        open remote core');
    print('  db open            open database control deck');
    print('  whoami             show your identity');
    print('  users              list all users');
    print('  store              show your balance and rank');
    print('  clear              clear the screen');
    print('  net / vpn          connect internet / vpn');
    return;
  }
  if (c === 'clear') { term.innerHTML = ''; return; }
  if (c === 'whoami') {
    print(ME ? ME.name + ' :: ' + ME.host + ' :: ' + ME.balance + '$ :: ' + rankOf(ME.hacks) : 'ghost', 'ok');
    return;
  }
  if (c === 'users') {
    var list = Object.keys(usersById).map(function (k) { return usersById[k]; });
    print('-- ' + list.length + ' nodes on the grid --', 'info');
    list.forEach(function (u) { print('  ' + u.host + ' :: ' + u.name + ' :: ' + u.balance + '$ :: ' + u.rank); });
    return;
  }
  if (c === 'store') {
    print('balance: ' + (ME ? ME.balance : 0) + '$', 'ok');
    print('hacks: ' + (ME ? ME.hacks : 0) + '  rank: ' + rankOf(ME ? ME.hacks : 0) + '  income: ' + incomeOf(ME ? ME.hacks : 0) + '$/10s', 'dim');
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
  if (c === 'bruce') {
    if (!installed.bruce) { print('bruce not installed. type: install bruce', 'err'); return; }
    print('== BRUCE v4.2 // db password engine ==', 'info');
    print('  1 - start');
    print('  2 - quit');
    TSTATE = { mode: 'bruce_menu', data: {} };
    return;
  }
  if (c === 'nos') {
    if (!installed.nos) { print('nos not installed. type: install nos', 'err'); return; }
    print('== NOS v1.9 // network port scanner ==', 'info');
    print('  1 - scan for ports');
    print('  2 - quit');
    TSTATE = { mode: 'nos_menu', data: {} };
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

/* ---------- terminal input ---------- */
termInput.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter') return;
  var raw = termInput.value;
  termInput.value = '';
  print('> ' + raw, 'info');
  if (TSTATE.mode !== 'idle') handleState(raw.trim());
  else handleCommand(raw.trim());
});

/* ---------- boot ---------- */
function boot() {
  bootTerm();
  try {
    var cached = JSON.parse(localStorage.getItem('hc_chat') || '[]');
    if (cached.length) { $('messages').innerHTML = ''; cached.forEach(addMsg); }
  } catch (e) {}
  setInterval(function () { fetch('/api/ping').catch(function () {}); }, 4 * 60 * 1000);
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