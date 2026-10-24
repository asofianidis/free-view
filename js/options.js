import * as S from './storage.js';
import { FONTS, GRADIENTS, THEMES } from './presets.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

let settings;
let data;

init();

async function init() {
  [settings, data] = await Promise.all([S.getSettings(), S.getData()]);
  applyOwnTheme();
  if (await S.isUnlocked(settings)) return start();
  $('#lock').hidden = false;
  $('#lock').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await S.verifyPassword($('#lockInput').value, settings)) {
      await S.markUnlocked();
      $('#lock').hidden = true;
      start();
    } else {
      $('#lockError').hidden = false;
    }
  });
}

function start() {
  $('#layout').hidden = false;
  $('#version').textContent = 'v' + chrome.runtime.getManifest().version;
  $('#fontSelect').replaceChildren(...Object.entries(FONTS).map(([k, f]) => new Option(f.name, k)));
  $('#engineSelect').replaceChildren(...Object.entries(S.SEARCH_ENGINES).map(([k, e]) => new Option(e.name, k)));
  $('#openNewtab').addEventListener('click', () => chrome.tabs.create({}));
  $('#shortcutLink').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  bindSettings();
  renderThemes();
  renderGradients();
  setupBackground();
  setupGroups();
  setupAnalytics();
  setupLock();
  setupSync();
  setupCss();
  setupNav();
  refresh();

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (changes[S.KEYS.settings]?.newValue) {
      settings = { ...S.DEFAULT_SETTINGS, ...changes[S.KEYS.settings].newValue };
      applyOwnTheme();
      refresh();
    }
    if (changes[S.KEYS.data]?.newValue) {
      data = changes[S.KEYS.data].newValue;
      renderGroups();
      renderStats();
    }
    if (changes[S.KEYS.stats]) renderStats();
    if (changes[S.KEYS.bg]) renderBgThumb();
    if (changes[S.KEYS.syncStatus]) renderSyncStatus();
    if (changes[S.KEYS.backups]) renderBackups();
  });
}

function applyOwnTheme() {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.style.setProperty('--accent', settings.accent);
}

function refresh() {
  fillSettings();
  for (const p of $$('.bg-panel')) p.classList.toggle('show', p.dataset.bg === settings.bgType);
  for (const b of $$('#gradients button')) b.classList.toggle('active', b.dataset.value === settings.bgGradient);
  $('#customEngine').hidden = settings.searchEngine !== 'custom';
  $('#lockOn').hidden = !settings.lockEnabled;
  $('#lockOff').hidden = settings.lockEnabled;
  if (document.activeElement !== $('#cssInput')) $('#cssInput').value = settings.customCSS;
}

function toast(message) {
  const t = $('#toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2500);
}

/* ---------- Generic settings binding ---------- */

function coerce(key, raw) {
  const def = S.DEFAULT_SETTINGS[key];
  if (typeof def === 'number') return Number(raw);
  if (typeof def === 'boolean') return !!raw;
  return raw;
}

function fillSettings() {
  for (const input of $$('[data-setting]')) {
    if (input === document.activeElement && input.type !== 'range') continue;
    const value = settings[input.dataset.setting];
    if (input.type === 'radio') input.checked = String(value) === input.value;
    else if (input.type === 'checkbox') input.checked = !!value;
    else if (input.type === 'color') input.value = value || input.dataset.empty || '#000000';
    else input.value = String(value ?? '');
    const out = input.parentElement.querySelector('output');
    if (out) out.textContent = input.value;
  }
}

function bindSettings() {
  for (const input of $$('[data-setting]')) {
    const key = input.dataset.setting;
    const event = input.dataset.lazy !== undefined || input.tagName === 'SELECT' || input.type === 'radio' || input.type === 'checkbox' ? 'change' : 'input';
    input.addEventListener(event, () => {
      const raw = input.type === 'checkbox' ? input.checked : input.value;
      if (input.type === 'radio' && !input.checked) return;
      const out = input.parentElement.querySelector('output');
      if (out) out.textContent = input.value;
      save({ [key]: coerce(key, raw) });
    });
  }
  for (const b of $$('[data-clear]')) b.addEventListener('click', () => save({ [b.dataset.clear]: '' }));
}

let pending = {};
let saveTimer;

// Range sliders fire rapidly; batch their writes.
function save(patch) {
  Object.assign(pending, patch);
  Object.assign(settings, patch);
  refresh();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const p = pending;
    pending = {};
    await S.updateSettings(p);
  }, 120);
}

/* ---------- Themes & background ---------- */

function renderThemes() {
  const list = $('#themeList');
  for (const t of THEMES) {
    const b = el('button', 'theme');
    b.type = 'button';
    if (t.bgType === 'gradient') b.style.background = t.bgGradient;
    else if (t.bgType === 'color') b.style.background = t.bgColor;
    else b.style.backgroundImage = `url("https://picsum.photos/seed/${S.dayKey()}/320/200")`;
    const dot = el('i');
    dot.style.background = t.accent;
    b.append(dot, el('span', '', t.name));
    b.addEventListener('click', () => {
      const { name, ...patch } = t;
      save(patch);
      toast(`Applied “${name}”`);
    });
    list.append(b);
  }
}

function renderGradients() {
  const box = $('#gradients');
  for (const g of GRADIENTS) {
    const b = el('button');
    b.type = 'button';
    b.dataset.value = g;
    b.style.background = g;
    b.addEventListener('click', () => save({ bgGradient: g, bgType: 'gradient' }));
    box.append(b);
  }
}

async function renderBgThumb() {
  const img = await S.getBackgroundImage();
  $('#bgThumb').style.backgroundImage = img ? `url(${JSON.stringify(img)})` : '';
  $('#bgRemove').hidden = !img;
}

function setupBackground() {
  renderBgThumb();
  $('#bgFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    toast('Processing image…');
    const img = await S.resizeImage(file, 2560, 1600, { mode: 'contain', quality: 0.9 });
    await S.setBackgroundImage(img);
    save({ bgType: 'image' });
    e.target.value = '';
    toast('Background updated');
  });
  $('#bgRemove').addEventListener('click', () => S.setBackgroundImage(''));
}

/* ---------- Groups ---------- */

function renderGroups() {
  const list = $('#groupList');
  list.replaceChildren();
  data.groups.forEach((g, i) => {
    const row = el('div', 'list-item');
    const color = el('input');
    color.type = 'color';
    color.value = g.color || settings.accent;
    color.title = 'Group color';
    color.addEventListener('change', () => updateGroup(g.id, { color: color.value }));
    const name = el('input');
    name.value = g.name;
    name.addEventListener('change', () => name.value.trim() && updateGroup(g.id, { name: name.value.trim() }));
    const count = el('span', 'meta', `${data.dials.filter((d) => d.groupId === g.id).length} dials`);
    row.append(color, name, count);
    if (data.defaultGroupId === g.id) row.append(el('span', 'badge', 'Default'));
    else row.append(button('Make default', () => S.updateData((d) => { d.defaultGroupId = g.id; })));
    row.append(
      button('↑', () => moveGroup(i, -1), i === 0),
      button('↓', () => moveGroup(i, 1), i === data.groups.length - 1),
      button('No color', () => updateGroup(g.id, { color: '' }), !g.color),
      button('Delete', () => deleteGroup(g), data.groups.length === 1, 'danger')
    );
    list.append(row);
  });
}

function button(label, onClick, disabled = false, extra = '') {
  const b = el('button', `btn small ${extra}`, label);
  b.type = 'button';
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

const updateGroup = (id, patch) => S.updateData((d) => Object.assign(d.groups.find((g) => g.id === id), patch));

function moveGroup(i, step) {
  return S.updateData((d) => {
    const [g] = d.groups.splice(i, 1);
    d.groups.splice(i + step, 0, g);
  });
}

async function deleteGroup(g) {
  const ids = data.dials.filter((d) => d.groupId === g.id).map((d) => d.id);
  if (!confirm(`Delete the group “${g.name}”${ids.length ? ` and its ${ids.length} dial(s)` : ''}?`)) return;
  await S.updateData((d) => {
    d.groups = d.groups.filter((x) => x.id !== g.id);
    d.dials = d.dials.filter((x) => x.groupId !== g.id);
    if (d.defaultGroupId === g.id) d.defaultGroupId = d.groups[0].id;
  });
  await chrome.storage.local.remove(ids.map((id) => S.THUMB_PREFIX + id));
}

async function setupGroups() {
  renderGroups();
  $('#addGroup').addEventListener('click', async () => {
    const name = $('#newGroupName').value.trim();
    if (!name) return $('#newGroupName').focus();
    await S.updateData((d) => { d.groups.push({ id: S.uid(), name, color: '' }); });
    $('#newGroupName').value = '';
  });

  const [root] = await chrome.bookmarks.getTree();
  const folders = [];
  const walk = (node, depth) => {
    if (node.url) return;
    if (depth > 0) folders.push({ node, depth });
    node.children?.forEach((c) => walk(c, depth + 1));
  };
  walk(root, 0);
  $('#bookmarkFolder').replaceChildren(...folders.map(({ node, depth }) => new Option(`${'  '.repeat(depth - 1)}${node.title || 'Untitled'}`, node.id)));

  $('#importFolder').addEventListener('click', async () => {
    const id = $('#bookmarkFolder').value;
    const node = folders.find((f) => f.node.id === id)?.node;
    if (!node) return;
    const links = [];
    const collect = (n) => (n.url ? links.push(n) : n.children?.forEach(collect));
    collect(node);
    if (!links.length) return toast('That folder has no bookmarks.');
    const groupId = S.uid();
    await S.updateData((d) => {
      d.groups.push({ id: groupId, name: node.title || 'Bookmarks', color: '' });
      for (const b of links) d.dials.push(S.createDial({ url: b.url, title: b.title, groupId }));
    });
    toast(`Imported ${links.length} bookmark(s)`);
  });

  $('#importTop').addEventListener('click', async () => {
    const sites = await chrome.topSites.get();
    let added = 0;
    await S.updateData((d) => {
      for (const s of sites) {
        if (d.dials.some((x) => x.groupId === d.defaultGroupId && S.normalizeUrl(x.url) === S.normalizeUrl(s.url))) continue;
        d.dials.push(S.createDial({ url: s.url, title: s.title, groupId: d.defaultGroupId }));
        added++;
      }
    });
    toast(`Added ${added} site(s)`);
  });
}

/* ---------- Analytics ---------- */

function setupAnalytics() {
  $('#statsRange').addEventListener('change', renderStats);
  $('#resetStats').addEventListener('click', async () => {
    if (confirm('Reset all visit statistics?')) await S.resetStats();
  });
  renderStats();
}

async function renderStats() {
  const stats = await S.getStats();
  const range = $('#statsRange').value;
  const days = range === 'all' ? null : Number(range);
  const spanDays = days || 30;
  const keys = [];
  for (let i = spanDays - 1; i >= 0; i--) keys.push(S.dayKey(Date.now() - i * 864e5));
  const cutoff = days ? keys[0] : '';

  const rows = data.dials.map((d) => {
    const s = stats[d.id] || { total: 0, last: 0, days: {} };
    const visits = days ? Object.entries(s.days).filter(([k]) => k >= cutoff).reduce((a, [, v]) => a + v, 0) : s.total;
    return { d, s, visits };
  }).sort((a, b) => b.visits - a.visits || b.s.last - a.s.last);

  const total = rows.reduce((a, r) => a + r.visits, 0);
  const top = rows[0]?.visits ? rows[0].d.title : '—';
  const unused = rows.filter((r) => !r.visits).length;
  const summary = [
    [total, 'visits'],
    [data.dials.length, 'dials'],
    [data.groups.length, 'groups'],
    [top, 'most visited'],
    [unused, 'unused dials'],
  ];
  $('#statsSummary').replaceChildren(...summary.map(([v, label]) => {
    const box = el('div', 'stat');
    box.append(el('b', '', String(v)), el('span', '', label));
    return box;
  }));

  const groupName = Object.fromEntries(data.groups.map((g) => [g.id, g.name]));
  const body = $('#statsBody');
  body.replaceChildren(...rows.map(({ d, s, visits }) => {
    const tr = el('tr');
    const name = el('td');
    const nameWrap = el('div', 'dial-name');
    const img = el('img');
    img.src = S.faviconUrl(d.url, 32);
    img.alt = '';
    nameWrap.append(img, el('span', '', d.title));
    name.append(nameWrap);
    name.title = d.url;
    const spark = el('div', 'spark');
    const series = keys.map((k) => s.days[k] || 0);
    const max = Math.max(1, ...series);
    for (const v of series) {
      const bar = el('i');
      bar.style.height = `${(v / max) * 100}%`;
      if (!v) bar.style.opacity = '0.2';
      spark.append(bar);
    }
    const sparkCell = el('td');
    sparkCell.append(spark);
    tr.append(name, el('td', '', groupName[d.groupId] || ''), el('td', 'num', String(visits)), sparkCell, el('td', 'muted', s.last ? new Date(s.last).toLocaleString() : 'Never'));
    return tr;
  }));
}

/* ---------- Lock ---------- */

function setupLock() {
  $('#setPw').addEventListener('click', async () => {
    const a = $('#pw1').value;
    const b = $('#pw2').value;
    const msg = $('#pwMsg');
    if (a.length < 4) return (msg.textContent = 'Use at least 4 characters.');
    if (a !== b) return (msg.textContent = 'Passwords do not match.');
    await S.setPassword(a);
    $('#pw1').value = $('#pw2').value = '';
    msg.textContent = '';
    settings = await S.getSettings();
    refresh();
    toast('Lock enabled');
  });
  $('#changePw').addEventListener('click', () => {
    $('#lockOff').hidden = false;
    $('#lockOn').hidden = true;
    $('#pw1').focus();
  });
  $('#removePw').addEventListener('click', async () => {
    if (!confirm('Remove the password lock?')) return;
    await S.clearPassword();
    settings = await S.getSettings();
    refresh();
    toast('Lock removed');
  });
}

/* ---------- Sync, export, backups ---------- */

async function renderSyncStatus() {
  const s = await S.getSyncStatus();
  $('#syncStatus').textContent = s ? `${s.message} (${new Date(s.at).toLocaleString()})` : 'Not synced yet.';
  $('#syncStatus').className = 'small ' + (s && !s.ok ? 'error' : 'muted');
}

async function message(type) {
  const res = await chrome.runtime.sendMessage({ type });
  if (!res?.ok) throw new Error(res?.error || 'Unknown error');
  return res.result;
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = el('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function renderBackups() {
  const list = await S.getBackups();
  $('#backupList').replaceChildren(...list.map((b) => {
    const row = el('div', 'list-item');
    row.append(
      el('span', '', new Date(b.at).toLocaleString()),
      el('span', 'meta', `${b.reason} · ${b.data.dials.length} dials · ${b.data.groups.length} groups`),
      el('span', 'spacer')
    );
    row.append(
      button('Download', () => download(`freeview-backup-${S.dayKey(b.at)}.json`, JSON.stringify({ app: 'FreeView', format: 1, data: b.data, settings: b.settings }, null, 2))),
      button('Restore', async () => {
        if (!confirm('Replace your current dials and settings with this backup?')) return;
        await S.restoreBackup(b.at);
        toast('Backup restored');
      })
    );
    return row;
  }));
  if (!list.length) $('#backupList').append(el('p', 'muted small', 'No backups yet.'));
}

function setupSync() {
  renderSyncStatus();
  renderBackups();
  const guard = (fn, ok) => async () => {
    try {
      const result = await fn();
      toast(ok(result));
    } catch (e) {
      toast(e.message);
    }
  };
  $('#syncToggle').addEventListener('change', async (e) => {
    if (!e.target.checked) return;
    await S.updateSettings({ syncEnabled: true });
    guard(() => message('syncNow'), () => 'Sync enabled')();
  });
  $('#syncNow').addEventListener('click', guard(() => message('syncNow'), () => 'Synced'));
  $('#syncPull').addEventListener('click', guard(() => message('pullSync'), (r) => (r === 'empty' ? 'Nothing in sync yet' : 'Downloaded synced copy')));
  $('#syncPush').addEventListener('click', guard(() => message('pushSync'), () => 'Uploaded to sync'));

  $('#exportBtn').addEventListener('click', async () => {
    const payload = await S.exportAll({ thumbs: $('#exportThumbs').checked });
    download(`freeview-${S.dayKey()}.json`, JSON.stringify(payload));
  });
  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const merge = $('#importMerge').checked;
      if (!merge && !confirm('Replace your current dials and settings with this file?')) return;
      await S.createBackup('before import');
      await S.importAll(payload, { merge });
      toast(merge ? 'Merged' : 'Imported');
    } catch (err) {
      toast(err.message);
    }
  });

  $('#backupNow').addEventListener('click', async () => {
    await S.createBackup('manual');
    toast('Backup created');
  });

  $('#resetSettings').addEventListener('click', async () => {
    if (!confirm('Reset all settings to their defaults? Your dials are kept.')) return;
    const keep = { lockEnabled: settings.lockEnabled, lockHash: settings.lockHash, lockSalt: settings.lockSalt, syncEnabled: settings.syncEnabled };
    await S.saveSettings({ ...S.DEFAULT_SETTINGS, ...keep });
    toast('Settings reset');
  });
  $('#resetAll').addEventListener('click', async () => {
    if (!confirm('Delete ALL dials, groups and settings? A backup is created first.')) return;
    await S.createBackup('before reset');
    const backups = await S.getBackups();
    await chrome.storage.local.clear();
    await chrome.storage.local.set({ [S.KEYS.backups]: backups });
    await S.lockNow();
    location.reload();
  });
}

/* ---------- Custom CSS ---------- */

function setupCss() {
  $('#cssSave').addEventListener('click', async () => {
    await S.updateSettings({ customCSS: $('#cssInput').value });
    $('#cssMsg').textContent = 'Applied. Open a new tab to see it.';
  });
}

/* ---------- Navigation highlight ---------- */

function setupNav() {
  const links = $$('.nav a[href^="#"]');
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const a of links) a.classList.toggle('active', a.getAttribute('href') === `#${entry.target.id}`);
    }
  }, { rootMargin: '-10% 0px -80% 0px' });
  for (const s of $$('main section')) observer.observe(s);
}
