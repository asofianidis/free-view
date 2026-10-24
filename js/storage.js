// Shared data layer used by the new tab page, options page, popup and service worker.

export const KEYS = {
  data: 'fv:data',
  settings: 'fv:settings',
  state: 'fv:state',
  bg: 'fv:bg',
  backups: 'fv:backups',
  stats: 'fv:stats',
  thumbMeta: 'fv:thumbMeta',
  device: 'fv:device',
  syncStatus: 'fv:syncStatus',
};
export const THUMB_PREFIX = 'fv:thumb:';
export const SYNC_META = 'fv:sync:meta';
const SYNC_CHUNK = 'fv:sync:';
const SYNC_CHUNK_SIZE = 6000;
const UNLOCK_KEY = 'fv:unlockedAt';

export const DEFAULT_SETTINGS = {
  // Appearance
  theme: 'dark',
  accent: '#4f8cff',
  fontFamily: 'system',
  googleFont: '',
  fontSize: 13,
  textColor: '',
  // Background
  bgType: 'gradient',
  bgColor: '#1b1f2a',
  bgGradient: 'linear-gradient(135deg, #1e2a44 0%, #3a1f4a 100%)',
  bgUrl: '',
  bgSize: 'cover',
  bgBlur: 0,
  bgDim: 0.15,
  // Layout & dials
  columns: 0,
  dialWidth: 220,
  dialRatio: '16 / 10',
  gap: 22,
  radius: 12,
  maxWidth: 1400,
  dialStyle: 'thumbnail',
  titlePosition: 'below',
  dialShadow: true,
  dialOpacity: 1,
  hoverEffect: 'lift',
  verticalCenter: true,
  showAddTile: true,
  showGroups: true,
  // Header
  showSearch: true,
  searchEngine: 'default',
  customSearchUrl: '',
  showClock: true,
  clock24: true,
  showDate: true,
  // Behavior
  openIn: 'current',
  rememberGroup: true,
  shortcuts: true,
  confirmDelete: false,
  autoThumbnails: true,
  thumbMaxAgeDays: 7,
  captureOnAdd: false,
  trackVisits: true,
  // Sidebar
  sidebarEnabled: true,
  sidebarSide: 'left',
  sidebarHover: false,
  // Privacy
  lockEnabled: false,
  lockHash: '',
  lockSalt: '',
  lockTimeoutMin: 0,
  // Advanced
  customCSS: '',
  syncEnabled: false,
  autoBackup: true,
  backupKeep: 10,
  updatedAt: 0,
};

export const SEARCH_ENGINES = {
  default: { name: 'Browser default', url: '' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=%s' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=%s' },
  ecosia: { name: 'Ecosia', url: 'https://www.ecosia.org/search?q=%s' },
  startpage: { name: 'Startpage', url: 'https://www.startpage.com/do/search?q=%s' },
  yahoo: { name: 'Yahoo', url: 'https://search.yahoo.com/search?p=%s' },
  custom: { name: 'Custom', url: '' },
};

const local = chrome.storage.local;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------- Data (groups + dials) ---------- */

export function defaultData() {
  const id = uid();
  return { groups: [{ id, name: 'Home', color: '' }], dials: [], defaultGroupId: id, updatedAt: 0 };
}

export async function getData() {
  const { [KEYS.data]: d } = await local.get(KEYS.data);
  if (d && Array.isArray(d.groups) && d.groups.length) return d;
  const fresh = defaultData();
  await local.set({ [KEYS.data]: fresh });
  return fresh;
}

export async function saveData(data, stamp = Date.now()) {
  data.updatedAt = stamp;
  await local.set({ [KEYS.data]: data });
  return data;
}

export async function updateData(fn) {
  const data = await getData();
  const result = await fn(data);
  await saveData(data);
  return result;
}

export function createDial(fields) {
  return {
    id: uid(),
    url: '',
    title: '',
    groupId: '',
    thumbMode: 'auto',
    imageUrl: '',
    bgColor: '',
    textColor: '',
    created: Date.now(),
    ...fields,
    title: fields.title || hostname(fields.url),
  };
}

export async function addDial(fields) {
  return updateData((data) => {
    const valid = data.groups.some((g) => g.id === fields.groupId);
    const groupId = valid ? fields.groupId : data.defaultGroupId || data.groups[0].id;
    const dial = createDial({ ...fields, groupId });
    data.dials.push(dial);
    return dial;
  });
}

export async function removeDials(ids) {
  await updateData((data) => {
    data.dials = data.dials.filter((d) => !ids.includes(d.id));
  });
  await local.remove(ids.map((id) => THUMB_PREFIX + id));
}

/* ---------- Settings & UI state ---------- */

export async function getSettings() {
  const { [KEYS.settings]: s } = await local.get(KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(s || {}) };
}

export async function saveSettings(settings, stamp = Date.now()) {
  settings.updatedAt = stamp;
  await local.set({ [KEYS.settings]: settings });
  return settings;
}

export async function updateSettings(patch) {
  const s = await getSettings();
  Object.assign(s, patch);
  return saveSettings(s);
}

export async function getState() {
  const { [KEYS.state]: s } = await local.get(KEYS.state);
  return { lastGroupId: null, sidebarOpen: false, sidebarTab: 'bookmarks', ...(s || {}) };
}

export async function setState(patch) {
  const s = await getState();
  await local.set({ [KEYS.state]: { ...s, ...patch } });
}

/* ---------- Thumbnails & background image ---------- */

export async function getThumbs(ids) {
  const res = await local.get(ids.map((id) => THUMB_PREFIX + id));
  const out = {};
  for (const id of ids) if (res[THUMB_PREFIX + id]) out[id] = res[THUMB_PREFIX + id];
  return out;
}

export async function setThumb(id, dataUrl) {
  const { [KEYS.thumbMeta]: meta = {} } = await local.get(KEYS.thumbMeta);
  meta[id] = Date.now();
  await local.set({ [THUMB_PREFIX + id]: dataUrl, [KEYS.thumbMeta]: meta });
}

export async function removeThumb(id) {
  await local.remove(THUMB_PREFIX + id);
}

export async function getThumbMeta() {
  const { [KEYS.thumbMeta]: meta = {} } = await local.get(KEYS.thumbMeta);
  return meta;
}

export async function getBackgroundImage() {
  const { [KEYS.bg]: bg } = await local.get(KEYS.bg);
  return bg || '';
}

export async function setBackgroundImage(dataUrl) {
  if (dataUrl) await local.set({ [KEYS.bg]: dataUrl });
  else await local.remove(KEYS.bg);
}

/* ---------- URL helpers ---------- */

export function fixUrl(input) {
  const v = (input || '').trim();
  if (!v) return '';
  if (/^[a-z][\w+.-]*:\/\//i.test(v) || /^(about|chrome|edge|javascript|mailto|data|file):/i.test(v)) return v;
  return 'https://' + v;
}

export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    return (host + (u.port ? ':' + u.port : '') + path + u.search).toLowerCase();
  } catch {
    return (url || '').toLowerCase();
  }
}

export function findDialByUrl(data, url) {
  const n = normalizeUrl(url);
  return data.dials.find((d) => normalizeUrl(d.url) === n);
}

export function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url || '';
  }
}

export function faviconUrl(url, size = 64) {
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', url);
  u.searchParams.set('size', String(size));
  return u.toString();
}

export function colorFor(str) {
  let h = 0;
  for (const ch of str || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 55% 42%)`;
}

/* ---------- Images ---------- */

export async function blobToDataUrl(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return `data:${blob.type};base64,${btoa(bin)}`;
}

// mode 'cover' crops to exactly width x height (anchored to the top, like a page screenshot);
// mode 'contain' scales down to fit inside width x height, preserving aspect ratio.
export async function resizeImage(src, width = 640, height = 400, { mode = 'cover', type = 'image/jpeg', quality = 0.85 } = {}) {
  const blob = src instanceof Blob ? src : await (await fetch(src)).blob();
  const bmp = await createImageBitmap(blob);
  let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height, dw = width, dh = height;
  if (mode === 'cover') {
    const scale = Math.max(width / bmp.width, height / bmp.height);
    sw = width / scale;
    sh = height / scale;
    sx = (bmp.width - sw) / 2;
  } else {
    const scale = Math.min(1, width / bmp.width, height / bmp.height);
    dw = Math.round(bmp.width * scale);
    dh = Math.round(bmp.height * scale);
  }
  const canvas = new OffscreenCanvas(dw, dh);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, dw, dh);
  bmp.close();
  return blobToDataUrl(await canvas.convertToBlob({ type, quality }));
}

/* ---------- Analytics ---------- */

export const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

export async function getStats() {
  const { [KEYS.stats]: stats = {} } = await local.get(KEYS.stats);
  return stats;
}

export async function recordVisit(dialId) {
  const stats = await getStats();
  const s = (stats[dialId] ||= { total: 0, last: 0, days: {} });
  const today = dayKey();
  s.total += 1;
  s.last = Date.now();
  s.days[today] = (s.days[today] || 0) + 1;
  const cutoff = dayKey(Date.now() - 90 * 864e5);
  for (const k of Object.keys(s.days)) if (k < cutoff) delete s.days[k];
  await local.set({ [KEYS.stats]: stats });
}

export async function resetStats() {
  await local.remove(KEYS.stats);
}

/* ---------- Backups, export & import ---------- */

export async function getBackups() {
  const { [KEYS.backups]: list = [] } = await local.get(KEYS.backups);
  return list;
}

export async function createBackup(reason = 'manual') {
  const [data, settings, list] = await Promise.all([getData(), getSettings(), getBackups()]);
  list.unshift({ at: Date.now(), reason, data, settings });
  list.length = Math.min(list.length, Math.max(1, settings.backupKeep));
  await local.set({ [KEYS.backups]: list });
}

export async function restoreBackup(at) {
  const b = (await getBackups()).find((x) => x.at === at);
  if (!b) throw new Error('Backup not found');
  const current = await getSettings();
  await saveData(b.data);
  await saveSettings({ ...b.settings, ...lockFields(current), syncEnabled: current.syncEnabled });
}

const lockFields = (s) => ({ lockEnabled: s.lockEnabled, lockHash: s.lockHash, lockSalt: s.lockSalt, lockTimeoutMin: s.lockTimeoutMin });

export async function exportAll({ thumbs = true } = {}) {
  const [data, settings, stats, background] = await Promise.all([getData(), getSettings(), getStats(), getBackgroundImage()]);
  const payload = { app: 'FreeView', format: 1, exportedAt: new Date().toISOString(), data, settings: { ...settings, lockEnabled: false, lockHash: '', lockSalt: '' }, stats };
  if (thumbs) {
    payload.thumbs = await getThumbs(data.dials.map((d) => d.id));
    payload.background = background;
  }
  return payload;
}

export async function importAll(payload, { merge = false } = {}) {
  if (!payload || payload.app !== 'FreeView' || !payload.data?.groups) throw new Error('This file is not a FreeView backup.');
  const incoming = payload.data;
  if (merge) {
    await updateData((data) => {
      const groupIds = new Set(data.groups.map((g) => g.id));
      for (const g of incoming.groups) if (!groupIds.has(g.id)) data.groups.push(g);
      const existing = new Set(data.dials.map((d) => d.groupId + '|' + normalizeUrl(d.url)));
      for (const d of incoming.dials) {
        if (existing.has(d.groupId + '|' + normalizeUrl(d.url))) continue;
        data.dials.push(data.dials.some((x) => x.id === d.id) ? { ...d, id: uid() } : d);
      }
    });
  } else {
    const current = await getSettings();
    await saveData(incoming);
    if (payload.settings) await saveSettings({ ...DEFAULT_SETTINGS, ...payload.settings, ...lockFields(current), syncEnabled: current.syncEnabled });
    if (payload.stats) await local.set({ [KEYS.stats]: payload.stats });
    if (payload.background) await setBackgroundImage(payload.background);
  }
  if (payload.thumbs) {
    const items = {};
    for (const [id, url] of Object.entries(payload.thumbs)) items[THUMB_PREFIX + id] = url;
    await local.set(items);
  }
}

/* ---------- Password lock ---------- */

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

export async function hashPassword(password, saltB64) {
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150000 }, key, 256);
  return b64(bits);
}

export async function setPassword(password) {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await hashPassword(password, salt);
  await updateSettings({ lockEnabled: true, lockHash: hash, lockSalt: salt });
  await markUnlocked();
}

export async function clearPassword() {
  await updateSettings({ lockEnabled: false, lockHash: '', lockSalt: '' });
}

export async function verifyPassword(password, settings) {
  return (await hashPassword(password, settings.lockSalt)) === settings.lockHash;
}

export async function isUnlocked(settings) {
  if (!settings.lockEnabled || !settings.lockHash) return true;
  const { [UNLOCK_KEY]: at } = await chrome.storage.session.get(UNLOCK_KEY);
  if (!at) return false;
  return !(settings.lockTimeoutMin > 0 && Date.now() - at > settings.lockTimeoutMin * 60000);
}

export async function markUnlocked() {
  await chrome.storage.session.set({ [UNLOCK_KEY]: Date.now() });
}

export async function lockNow() {
  await chrome.storage.session.remove(UNLOCK_KEY);
}

/* ---------- Cross-device sync (chrome.storage.sync, chunked) ---------- */

export async function getDevice() {
  const { [KEYS.device]: id } = await local.get(KEYS.device);
  if (id) return id;
  const fresh = uid();
  await local.set({ [KEYS.device]: fresh });
  return fresh;
}

async function setSyncStatus(status) {
  await local.set({ [KEYS.syncStatus]: { ...status, at: Date.now() } });
}

export async function getSyncStatus() {
  const { [KEYS.syncStatus]: s } = await local.get(KEYS.syncStatus);
  return s || null;
}

export async function pushToSync(force = false) {
  const [data, settings] = await Promise.all([getData(), getSettings()]);
  const stamp = Math.max(data.updatedAt || 0, settings.updatedAt || 0);
  const { [SYNC_META]: meta } = await chrome.storage.sync.get(SYNC_META);
  if (!force && meta && meta.updatedAt >= stamp) return 'up-to-date';
  const { syncEnabled, ...syncable } = settings;
  const json = JSON.stringify({ data, settings: syncable });
  const items = {};
  let count = 0;
  for (let i = 0; i < json.length; i += SYNC_CHUNK_SIZE) items[SYNC_CHUNK + count++] = json.slice(i, i + SYNC_CHUNK_SIZE);
  items[SYNC_META] = { updatedAt: stamp, chunks: count, length: json.length, device: await getDevice() };
  try {
    await chrome.storage.sync.set(items);
  } catch (e) {
    await setSyncStatus({ ok: false, message: `Sync failed: ${e.message}. Custom CSS or very many dials can exceed the browser's sync quota.` });
    throw e;
  }
  if (meta && meta.chunks > count) {
    const stale = [];
    for (let i = count; i < meta.chunks; i++) stale.push(SYNC_CHUNK + i);
    await chrome.storage.sync.remove(stale);
  }
  await setSyncStatus({ ok: true, message: 'Uploaded to sync.' });
  return 'pushed';
}

export async function pullFromSync(force = false) {
  const all = await chrome.storage.sync.get(null);
  const meta = all[SYNC_META];
  if (!meta) return 'empty';
  const [data, settings] = await Promise.all([getData(), getSettings()]);
  const stamp = Math.max(data.updatedAt || 0, settings.updatedAt || 0);
  if (!force && meta.updatedAt <= stamp) return 'up-to-date';
  let json = '';
  for (let i = 0; i < meta.chunks; i++) json += all[SYNC_CHUNK + i] ?? '';
  if (json.length !== meta.length) return 'incomplete';
  const remote = JSON.parse(json);
  await saveData(remote.data, remote.data.updatedAt || meta.updatedAt);
  await saveSettings({ ...DEFAULT_SETTINGS, ...remote.settings, syncEnabled: settings.syncEnabled }, remote.settings.updatedAt || meta.updatedAt);
  await setSyncStatus({ ok: true, message: 'Downloaded changes from another device.' });
  return 'pulled';
}

export async function clearSync() {
  await chrome.storage.sync.clear();
}
