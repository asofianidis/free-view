import * as S from './js/storage.js';

const THUMB_W = 640;
const THUMB_H = 400;

// Tabs opened by the thumbnail refresher; ignored by visit tracking and auto-capture.
const capturingTabs = new Set();
// Last counted URL per tab, so reloads and SPA updates are not counted twice.
const lastCounted = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Install / startup ---------- */

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') await seed();
  chrome.alarms.create('autoBackup', { delayInMinutes: 5, periodInMinutes: 24 * 60 });
  await rebuildMenus();
});

chrome.runtime.onStartup.addListener(async () => {
  await rebuildMenus();
  const settings = await S.getSettings();
  if (settings.syncEnabled) await syncNow().catch(() => {});
});

async function seed() {
  const { [S.KEYS.data]: existing } = await chrome.storage.local.get(S.KEYS.data);
  if (existing) return;
  const data = S.defaultData();
  const top = await chrome.topSites.get().catch(() => []);
  for (const site of top.slice(0, 8)) {
    data.dials.push(S.createDial({ url: site.url, title: site.title, groupId: data.defaultGroupId }));
  }
  await S.saveData(data);
}

/* ---------- Context menus ---------- */

let menuSignature = '';
let menuQueue = Promise.resolve();

function rebuildMenus(data) {
  menuQueue = menuQueue.then(() => buildMenus(data)).catch(() => {});
  return menuQueue;
}

async function buildMenus(data) {
  data ||= await S.getData();
  const sig = JSON.stringify(data.groups.map((g) => [g.id, g.name]));
  if (sig === menuSignature) return;
  menuSignature = sig;
  await chrome.contextMenus.removeAll();
  const contexts = { page: ['page'], link: ['link'] };
  const titles = { page: 'Add page to FreeView', link: 'Add link to FreeView' };
  for (const kind of ['page', 'link']) {
    if (data.groups.length === 1) {
      chrome.contextMenus.create({ id: `${kind}:${data.groups[0].id}`, title: titles[kind], contexts: contexts[kind] });
      continue;
    }
    chrome.contextMenus.create({ id: kind, title: titles[kind], contexts: contexts[kind] });
    for (const g of data.groups) {
      chrome.contextMenus.create({ id: `${kind}:${g.id}`, parentId: kind, title: g.name, contexts: contexts[kind] });
    }
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const [kind, groupId] = String(info.menuItemId).split(':');
  if (kind === 'page' && tab) {
    await addTab(tab, groupId);
  } else if (kind === 'link' && info.linkUrl) {
    await S.addDial({ url: info.linkUrl, title: info.selectionText || '', groupId });
    flashBadge();
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'add-current-page') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) await addTab(tab);
});

async function addTab(tab, groupId) {
  if (!/^https?:|^file:/.test(tab.url || '')) return;
  const data = await S.getData();
  let dial = data.dials.find((d) => d.groupId === (groupId || data.defaultGroupId) && S.normalizeUrl(d.url) === S.normalizeUrl(tab.url));
  if (!dial) dial = await S.addDial({ url: tab.url, title: tab.title, groupId });
  await captureVisible(tab.windowId, dial.id).catch(() => {});
  flashBadge();
}

function flashBadge() {
  chrome.action.setBadgeBackgroundColor({ color: '#2fa34a' });
  chrome.action.setBadgeText({ text: '✓' });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
}

/* ---------- Thumbnails ---------- */

async function captureVisible(windowId, dialId) {
  const raw = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 90 });
  const thumb = await S.resizeImage(raw, THUMB_W, THUMB_H);
  await S.setThumb(dialId, thumb);
}

function waitForLoad(tabId, timeout = 20000) {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') done();
    };
    const timer = setTimeout(done, timeout);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

let refreshQueue = Promise.resolve();

// Opens a temporary window, loads each dial and screenshots it.
function refreshThumbs(ids) {
  refreshQueue = refreshQueue.then(async () => {
    const data = await S.getData();
    const dials = ids.map((id) => data.dials.find((d) => d.id === id)).filter((d) => d && /^https?:|^file:/.test(d.url));
    if (!dials.length) return;
    const win = await chrome.windows.create({ url: 'about:blank', focused: true, width: 1280, height: 800, type: 'normal' });
    const tabId = win.tabs[0].id;
    capturingTabs.add(tabId);
    try {
      for (const dial of dials) {
        const loaded = waitForLoad(tabId);
        await chrome.tabs.update(tabId, { url: dial.url });
        await loaded;
        await sleep(1200);
        await captureVisible(win.id, dial.id).catch(() => {});
      }
    } finally {
      capturingTabs.delete(tabId);
      await chrome.windows.remove(win.id).catch(() => {});
    }
  });
  return refreshQueue;
}

async function needsThumb(dial, settings) {
  if (!settings.autoThumbnails || (dial.thumbMode || 'auto') !== 'auto') return false;
  const meta = await S.getThumbMeta();
  const at = meta[dial.id] || 0;
  return Date.now() - at > settings.thumbMaxAgeDays * 864e5;
}

async function maybeAutoCapture(tab, dial, settings) {
  if (!tab.active || !(await needsThumb(dial, settings))) return;
  await sleep(1500);
  const fresh = await chrome.tabs.get(tab.id).catch(() => null);
  if (!fresh || !fresh.active || fresh.status !== 'complete' || S.normalizeUrl(fresh.url) !== S.normalizeUrl(dial.url)) return;
  const win = await chrome.windows.get(fresh.windowId);
  if (win.state === 'minimized') return;
  await captureVisible(fresh.windowId, dial.id).catch(() => {});
}

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete' || capturingTabs.has(tabId) || !/^https?:|^file:/.test(tab.url || '')) return;
  const [data, settings] = await Promise.all([S.getData(), S.getSettings()]);
  const dial = S.findDialByUrl(data, tab.url);
  const norm = S.normalizeUrl(tab.url);
  if (!dial) {
    lastCounted.delete(tabId);
    return;
  }
  if (settings.trackVisits && lastCounted.get(tabId) !== norm) {
    lastCounted.set(tabId, norm);
    await S.recordVisit(dial.id);
  }
  await maybeAutoCapture(tab, dial, settings);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  if (capturingTabs.has(tabId)) return;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || tab.status !== 'complete' || !/^https?:|^file:/.test(tab.url || '')) return;
  const [data, settings] = await Promise.all([S.getData(), S.getSettings()]);
  const dial = S.findDialByUrl(data, tab.url);
  if (dial) await maybeAutoCapture(tab, dial, settings);
});

chrome.tabs.onRemoved.addListener((tabId) => lastCounted.delete(tabId));

/* ---------- Sync ---------- */

let pushTimer = null;
let deviceId = null;

async function syncNow() {
  await S.pullFromSync();
  await S.pushToSync();
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    const settings = await S.getSettings();
    if (settings.syncEnabled) await S.pushToSync().catch(() => {});
  }, 3000);
}

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local') {
    if (changes[S.KEYS.data]?.newValue) rebuildMenus(changes[S.KEYS.data].newValue);
    if (changes[S.KEYS.data] || changes[S.KEYS.settings]) schedulePush();
  } else if (area === 'sync' && changes[S.SYNC_META]?.newValue) {
    deviceId ||= await S.getDevice();
    if (changes[S.SYNC_META].newValue.device === deviceId) return;
    const settings = await S.getSettings();
    // Chunks may arrive slightly after the meta record; retry briefly.
    for (let i = 0; i < 5 && settings.syncEnabled; i++) {
      const result = await S.pullFromSync().catch(() => 'error');
      if (result !== 'incomplete') break;
      await sleep(2000);
    }
  }
});

/* ---------- Backups ---------- */

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'autoBackup') return;
  const settings = await S.getSettings();
  if (settings.autoBackup) await S.createBackup('auto');
});

/* ---------- Messages from pages ---------- */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handlers = {
    refreshThumbs: () => refreshThumbs(msg.ids),
    syncNow: () => syncNow(),
    pushSync: () => S.pushToSync(true),
    pullSync: () => S.pullFromSync(true),
  };
  const handler = handlers[msg?.type];
  if (!handler) return false;
  handler().then(
    (result) => sendResponse({ ok: true, result }),
    (e) => sendResponse({ ok: false, error: e.message })
  );
  return true;
});
