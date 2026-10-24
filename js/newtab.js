import * as S from './storage.js';
import { fontStack, googleFontHref, BROWSER_PAGES } from './presets.js';

const $ = (sel, root = document) => root.querySelector(sel);

const ICONS = {
  edit: '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75Zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75Z"/>',
  trash: '<path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6Zm13-15h-3.5l-1-1h-5l-1 1H5v2h14Z"/>',
  plus: '<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6Z"/>',
  caret: '<path d="M7 10l5 5 5-5Z"/>',
  folder: '<path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8Z"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24">${ICONS[name]}</svg>`;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

let data;
let settings;
let state;
let thumbs = {};
let currentGroupId;
let dragDialId = null;
let dragGroupId = null;
let started = false;

boot();

async function boot() {
  [data, settings, state] = await Promise.all([S.getData(), S.getSettings(), S.getState()]);
  await applyAppearance();
  document.body.classList.remove('loading');
  if (await S.isUnlocked(settings)) start();
  else showLock();
}

/* ---------- Lock ---------- */

function showLock() {
  $('#lock').hidden = false;
  $('#toolbar').hidden = true;
  $('#sidebar').hidden = true;
  $('#lockInput').focus();
  $('#lock').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await S.verifyPassword($('#lockInput').value, settings)) {
      await S.markUnlocked();
      $('#lock').hidden = true;
      $('#toolbar').hidden = false;
      applyAppearance();
      start();
    } else {
      $('#lockError').hidden = false;
      $('#lockInput').select();
    }
  });
}

/* ---------- Startup ---------- */

async function start() {
  if (started) return;
  started = true;
  $('#app').hidden = false;
  currentGroupId = pickStartGroup();
  [thumbs] = await Promise.all([S.getThumbs(data.dials.map((d) => d.id)), loadDefaultIconSig()]);
  renderAll();
  setupHeader();
  setupToolbar();
  setupGrid();
  setupEditor();
  setupGroupEditor();
  setupSidebar();
  setupKeyboard();
  setupStorageListener();
  document.addEventListener('click', closeMenu);
  window.addEventListener('blur', closeMenu);
  window.addEventListener('resize', closeMenu);
}

function pickStartGroup() {
  const has = (id) => id && data.groups.some((g) => g.id === id);
  if (settings.rememberGroup && has(state.lastGroupId)) return state.lastGroupId;
  if (has(data.defaultGroupId)) return data.defaultGroupId;
  return data.groups[0].id;
}

function setupStorageListener() {
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    let rerender = false;
    if (changes[S.KEYS.data]?.newValue) {
      data = changes[S.KEYS.data].newValue;
      if (!data.groups.some((g) => g.id === currentGroupId)) currentGroupId = pickStartGroup();
      const missing = data.dials.filter((d) => !(d.id in thumbs)).map((d) => d.id);
      if (missing.length) Object.assign(thumbs, await S.getThumbs(missing));
      rerender = true;
    }
    if (changes[S.KEYS.settings]?.newValue) {
      settings = { ...S.DEFAULT_SETTINGS, ...changes[S.KEYS.settings].newValue };
      await applyAppearance();
      rerender = true;
    }
    if (changes[S.KEYS.bg]) applyBackground();
    for (const [key, change] of Object.entries(changes)) {
      if (!key.startsWith(S.THUMB_PREFIX)) continue;
      const id = key.slice(S.THUMB_PREFIX.length);
      if (change.newValue) thumbs[id] = change.newValue;
      else delete thumbs[id];
      rerender = true;
      if (editing?.id === id) updatePreview();
    }
    if (rerender && !dragDialId && !dragGroupId) renderAll();
  });
}

/* ---------- Appearance ---------- */

async function applyAppearance() {
  const root = document.documentElement;
  const s = settings;
  root.dataset.theme = s.theme;
  const vars = {
    '--accent': s.accent,
    '--dial-w': `${s.dialWidth}px`,
    '--gap': `${s.gap}px`,
    '--radius': `${s.radius}px`,
    '--ratio': s.dialRatio,
    '--max-width': `${s.maxWidth}px`,
    '--font-size': `${s.fontSize}px`,
    '--dial-opacity': s.dialOpacity,
    '--font': fontStack(s),
    '--grid-cols': s.columns > 0 ? `repeat(${s.columns}, var(--dial-w))` : 'repeat(auto-fill, var(--dial-w))',
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  if (s.textColor) root.style.setProperty('--dial-text', s.textColor);
  else root.style.removeProperty('--dial-text');

  let link = $('#googleFont');
  if (s.googleFont) {
    if (!link) {
      link = el('link');
      link.id = 'googleFont';
      link.rel = 'stylesheet';
      document.head.append(link);
    }
    link.href = googleFontHref(s.googleFont);
  } else link?.remove();

  const body = document.body;
  const prefixed = ['hover-', 'title-', 'style-', 'sb-left', 'sb-right'];
  for (const c of [...body.classList]) if (prefixed.some((p) => c.startsWith(p))) body.classList.remove(c);
  body.classList.add(`hover-${s.hoverEffect}`, `title-${s.titlePosition}`, `style-${s.dialStyle}`, `sb-${s.sidebarSide}`);
  body.classList.toggle('v-center', s.verticalCenter);
  body.classList.toggle('shadow', s.dialShadow);

  $('#customCss').textContent = s.customCSS || '';
  $('#sidebar').hidden = !s.sidebarEnabled;
  $('#btnSidebar').hidden = !s.sidebarEnabled;
  if (!s.sidebarEnabled) body.classList.remove('sb-open');
  $('#btnLock').hidden = !s.lockEnabled;
  await applyBackground();
}

async function applyBackground() {
  const bg = $('#bg');
  const s = settings;
  bg.style.background = '';
  let image = '';
  if (s.bgType === 'color') bg.style.background = s.bgColor;
  else if (s.bgType === 'gradient') bg.style.background = s.bgGradient;
  else if (s.bgType === 'image') image = await S.getBackgroundImage();
  else if (s.bgType === 'url') image = s.bgUrl;
  else if (s.bgType === 'daily') image = `https://picsum.photos/seed/${S.dayKey()}/1920/1080`;
  if (image) {
    bg.style.backgroundColor = s.bgColor;
    bg.style.backgroundImage = `url(${JSON.stringify(image)})`;
    bg.style.backgroundSize = s.bgSize === 'tile' ? 'auto' : s.bgSize;
    bg.style.backgroundRepeat = s.bgSize === 'tile' ? 'repeat' : 'no-repeat';
  }
  const blur = Number(s.bgBlur) || 0;
  bg.style.filter = blur ? `blur(${blur}px)` : '';
  bg.style.inset = blur ? `-${blur * 2}px` : '0';
  $('#bgDim').style.opacity = s.bgDim;
}

/* ---------- Header: clock & search ---------- */

let clockTimer;

function setupHeader() {
  $('#search').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('#searchInput').value.trim();
    if (text) search(text);
  });
}

function renderHeader() {
  $('#clock').hidden = !settings.showClock;
  $('#search').hidden = !settings.showSearch;
  clearInterval(clockTimer);
  if (settings.showClock) {
    tickClock();
    clockTimer = setInterval(tickClock, 1000);
  }
  const engine = S.SEARCH_ENGINES[settings.searchEngine];
  $('#searchInput').placeholder = settings.searchEngine === 'default' || !engine ? 'Search the web or type a URL' : `Search ${engine.name} or type a URL`;
}

function tickClock() {
  const now = new Date();
  $('#clockTime').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !settings.clock24 });
  $('#clockDate').textContent = settings.showDate ? now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) : '';
}

function looksLikeUrl(text) {
  if (/\s/.test(text)) return false;
  return /^[a-z][\w+.-]*:\/\//i.test(text) || /^localhost(:\d+)?(\/|$)/i.test(text) || /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(text);
}

function search(text) {
  if (looksLikeUrl(text)) return chrome.tabs.update({ url: S.fixUrl(text) });
  const engine = settings.searchEngine;
  const template = engine === 'custom' ? settings.customSearchUrl : S.SEARCH_ENGINES[engine]?.url;
  if (template && template.includes('%s')) return chrome.tabs.update({ url: template.replace('%s', encodeURIComponent(text)) });
  chrome.search.query({ text, disposition: 'CURRENT_TAB' });
}

/* ---------- Rendering ---------- */

function renderAll() {
  renderHeader();
  renderGroups();
  renderGrid();
}

const groupDials = (groupId = currentGroupId) => data.dials.filter((d) => d.groupId === groupId);
const findDial = (id) => data.dials.find((d) => d.id === id);

function renderGroups() {
  const nav = $('#groups');
  nav.hidden = !settings.showGroups;
  nav.replaceChildren();
  for (const g of data.groups) {
    const b = el('button', 'group' + (g.id === currentGroupId ? ' active' : ''));
    b.draggable = true;
    b.dataset.id = g.id;
    if (g.color) {
      const dot = el('span', 'dot');
      dot.style.background = g.color;
      b.append(dot);
    }
    b.append(el('span', 'name', g.name), el('span', 'count', String(groupDials(g.id).length)));
    b.addEventListener('click', () => switchGroup(g.id));
    b.addEventListener('dblclick', () => openGroupEditor(g));
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      groupMenu(e, g);
    });
    b.addEventListener('dragstart', (e) => {
      dragGroupId = g.id;
      b.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-fv-group', g.id);
    });
    b.addEventListener('dragend', () => {
      dragGroupId = null;
      b.classList.remove('dragging');
      renderAll();
    });
    b.addEventListener('dragover', (e) => {
      if (dragGroupId === g.id) return;
      if (dragDialId || dragGroupId || isExternalLink(e)) {
        e.preventDefault();
        b.classList.add('drop');
      }
    });
    b.addEventListener('dragleave', () => b.classList.remove('drop'));
    b.addEventListener('drop', async (e) => {
      e.preventDefault();
      b.classList.remove('drop');
      if (dragDialId) await moveDialToGroup(dragDialId, g.id);
      else if (dragGroupId) await moveGroup(dragGroupId, g.id);
      else {
        const link = readDroppedLink(e);
        if (link) {
          await S.addDial({ ...link, groupId: g.id });
          toast(`Added to “${g.name}”`);
        }
      }
    });
    nav.append(b);
  }
  const add = el('button', 'group add');
  add.title = 'New group';
  add.innerHTML = icon('plus');
  add.addEventListener('click', () => openGroupEditor(null));
  nav.append(add);
}

function renderGrid() {
  const grid = $('#grid');
  const dials = groupDials();
  grid.replaceChildren(...dials.map((d) => dialElement(d)));
  if (settings.showAddTile) grid.append(addTile());
  $('#empty').hidden = dials.length > 0;
}

function dialElement(d, { preview = false, thumbOverride } = {}) {
  const a = el('a', 'dial');
  a.href = d.url;
  a.draggable = !preview;
  a.dataset.id = d.id || '';
  a.title = `${d.title}\n${d.url}`;
  const thumb = el('div', 'thumb');
  const title = el('div', 'title', d.title);

  if (settings.dialStyle === 'compact') {
    const badge = siteIcon(d, 32, 'compact-icon');
    badge.style.background = S.colorFor(S.hostname(d.url));
    thumb.append(badge, el('span', 'compact-title', d.title));
    if (d.bgColor) thumb.style.background = d.bgColor;
    if (d.textColor) thumb.style.setProperty('--dial-text', d.textColor);
  } else {
    thumb.append(thumbContent(d, thumbOverride));
  }
  a.append(thumb);
  if (settings.titlePosition === 'overlay' && settings.dialStyle !== 'compact') thumb.append(title);
  else a.append(title);

  if (!preview) {
    const actions = el('div', 'actions');
    actions.innerHTML = `<button data-action="edit" title="Edit">${icon('edit')}</button><button data-action="delete" title="Delete">${icon('trash')}</button>`;
    a.append(actions);
  }
  return a;
}

function thumbContent(d, thumbOverride) {
  const mode = d.thumbMode || 'auto';
  const stored = thumbOverride !== undefined ? thumbOverride : thumbs[d.id];
  if (mode === 'image' && (stored || d.imageUrl)) {
    const img = el('img', 'custom');
    img.src = stored || d.imageUrl;
    img.alt = '';
    img.draggable = false;
    return img;
  }
  if (mode === 'auto' && settings.dialStyle === 'thumbnail' && stored) {
    const img = el('img', 'shot');
    img.src = stored;
    img.alt = '';
    img.draggable = false;
    return img;
  }
  const host = S.hostname(d.url);
  const tile = el('div', 'logo-tile');
  tile.style.background = d.bgColor || S.colorFor(host);
  if (d.textColor) tile.style.color = d.textColor;
  if (mode === 'color') {
    tile.classList.add('text-tile');
    tile.textContent = d.title;
    return tile;
  }
  tile.append(siteIcon(d, 64), el('div', 'host', host));
  return tile;
}

// Signature of the browser's generic "no favicon" image, so unknown sites can show a monogram instead.
let defaultIconSig = null;

function iconSignature(img) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  c.getContext('2d').drawImage(img, 0, 0, 16, 16);
  return c.toDataURL();
}

function loadDefaultIconSig() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve((defaultIconSig = iconSignature(img)));
    img.onerror = () => resolve(null);
    img.src = S.faviconUrl('https://freeview-default.invalid/', 64);
  });
}

function siteIcon(d, size, className = '') {
  const wrap = el('span', `site-icon ${className}`);
  const letter = el('span', 'monogram', (d.title || S.hostname(d.url) || '?').trim().charAt(0).toUpperCase());
  const img = el('img');
  img.alt = '';
  img.draggable = false;
  img.hidden = true;
  img.addEventListener('load', () => {
    if (iconSignature(img) === defaultIconSig) return;
    img.hidden = false;
    letter.hidden = true;
  });
  img.src = S.faviconUrl(d.url, size);
  wrap.append(letter, img);
  return wrap;
}

function addTile() {
  const a = el('a', 'dial add-tile');
  a.href = '#';
  a.title = 'Add a dial';
  const thumb = el('div', 'thumb');
  thumb.innerHTML = icon('plus');
  a.append(thumb);
  if (settings.dialStyle !== 'compact' && settings.titlePosition === 'below') a.append(el('div', 'title', ' '));
  return a;
}

/* ---------- Groups ---------- */

function switchGroup(id) {
  if (!data.groups.some((g) => g.id === id)) return;
  currentGroupId = id;
  if (settings.rememberGroup) S.setState({ lastGroupId: id });
  renderGroups();
  renderGrid();
}

function cycleGroup(step) {
  const i = data.groups.findIndex((g) => g.id === currentGroupId);
  const next = data.groups[(i + step + data.groups.length) % data.groups.length];
  switchGroup(next.id);
}

async function moveGroup(id, beforeId) {
  await S.updateData((d) => {
    const from = d.groups.findIndex((g) => g.id === id);
    const [g] = d.groups.splice(from, 1);
    d.groups.splice(d.groups.findIndex((x) => x.id === beforeId), 0, g);
  });
}

async function deleteGroup(g) {
  if (data.groups.length === 1) return toast('You need at least one group.');
  const dials = groupDials(g.id);
  const msg = dials.length ? `Delete the group “${g.name}” and its ${dials.length} dial(s)?` : `Delete the group “${g.name}”?`;
  if (!confirm(msg)) return;
  await S.updateData((d) => {
    d.groups = d.groups.filter((x) => x.id !== g.id);
    d.dials = d.dials.filter((x) => x.groupId !== g.id);
    if (d.defaultGroupId === g.id) d.defaultGroupId = d.groups[0].id;
  });
  await chrome.storage.local.remove(dials.map((x) => S.THUMB_PREFIX + x.id));
}

function openAll(dials) {
  for (const d of dials) chrome.tabs.create({ url: d.url, active: false });
}

function refreshThumbs(dials) {
  const ids = dials.filter((d) => (d.thumbMode || 'auto') === 'auto').map((d) => d.id);
  if (!ids.length) return toast('No screenshot dials to refresh.');
  toast(`Refreshing ${ids.length} thumbnail(s)…`);
  chrome.runtime.sendMessage({ type: 'refreshThumbs', ids });
}

function groupMenu(e, g) {
  const dials = groupDials(g.id);
  showMenu(e.clientX, e.clientY, [
    { label: 'Open all in new tabs', action: () => openAll(dials), disabled: !dials.length },
    { label: 'Refresh thumbnails', action: () => refreshThumbs(dials), disabled: !dials.length },
    '-',
    { label: 'Edit group…', action: () => openGroupEditor(g) },
    { label: 'Set as default group', action: () => S.updateData((d) => { d.defaultGroupId = g.id; }), disabled: data.defaultGroupId === g.id },
    { label: 'New group…', action: () => openGroupEditor(null) },
    '-',
    { label: 'Delete group', danger: true, action: () => deleteGroup(g), disabled: data.groups.length === 1 },
  ]);
}

/* ---------- Group editor ---------- */

let editingGroup = null;

function setupGroupEditor() {
  const form = $('#groupForm');
  const f = (n) => form.elements.namedItem(n);
  f('color').addEventListener('input', () => { f('noColor').checked = false; });
  $('#groupCancel').addEventListener('click', () => $('#groupEditor').close());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = f('name').value.trim();
    if (!name) return;
    const color = f('noColor').checked ? '' : f('color').value;
    if (editingGroup) {
      const id = editingGroup.id;
      await S.updateData((d) => Object.assign(d.groups.find((g) => g.id === id), { name, color }));
    } else {
      const id = S.uid();
      await S.updateData((d) => { d.groups.push({ id, name, color }); });
      currentGroupId = id;
      if (settings.rememberGroup) S.setState({ lastGroupId: id });
    }
    $('#groupEditor').close();
  });
}

function openGroupEditor(g) {
  editingGroup = g;
  const form = $('#groupForm');
  const f = (n) => form.elements.namedItem(n);
  $('#groupFormTitle').textContent = g ? 'Edit group' : 'New group';
  f('name').value = g?.name || '';
  f('color').value = g?.color || settings.accent;
  f('noColor').checked = !g?.color;
  $('#groupEditor').showModal();
  f('name').focus();
}

/* ---------- Dial actions ---------- */

function openDial(d, mode = settings.openIn) {
  const url = d.url;
  if (mode === 'new') chrome.tabs.create({ url });
  else if (mode === 'background') chrome.tabs.create({ url, active: false });
  else if (mode === 'window') chrome.windows.create({ url });
  else if (mode === 'incognito') chrome.windows.create({ url, incognito: true });
  else chrome.tabs.update({ url });
}

async function deleteDial(d) {
  if (settings.confirmDelete && !confirm(`Delete “${d.title}”?`)) return;
  const index = data.dials.findIndex((x) => x.id === d.id);
  await S.updateData((dd) => { dd.dials = dd.dials.filter((x) => x.id !== d.id); });
  toast(`Deleted “${d.title}”`, {
    action: 'Undo',
    onAction: () => S.updateData((dd) => { dd.dials.splice(Math.min(index, dd.dials.length), 0, d); }),
    onExpire: () => S.removeThumb(d.id),
  });
}

async function moveDialToGroup(id, groupId) {
  const g = data.groups.find((x) => x.id === groupId);
  await S.updateData((d) => {
    const i = d.dials.findIndex((x) => x.id === id);
    const [dial] = d.dials.splice(i, 1);
    dial.groupId = groupId;
    d.dials.push(dial);
  });
  if (g) toast(`Moved to “${g.name}”`);
}

async function duplicateDial(d) {
  await S.updateData((dd) => {
    const i = dd.dials.findIndex((x) => x.id === d.id);
    dd.dials.splice(i + 1, 0, { ...d, id: S.uid(), created: Date.now() });
  });
}

function dialMenu(e, d) {
  const others = data.groups.filter((g) => g.id !== d.groupId);
  showMenu(e.clientX, e.clientY, [
    { label: 'Open', action: () => openDial(d, 'current') },
    { label: 'Open in new tab', action: () => openDial(d, 'new') },
    { label: 'Open in background tab', action: () => openDial(d, 'background') },
    { label: 'Open in new window', action: () => openDial(d, 'window') },
    { label: 'Open in incognito window', action: () => openDial(d, 'incognito') },
    '-',
    { label: 'Edit…', action: () => openEditor(d) },
    { label: 'Refresh thumbnail', action: () => refreshThumbs([d]), disabled: (d.thumbMode || 'auto') !== 'auto' },
    { label: 'Copy link', action: () => navigator.clipboard.writeText(d.url).then(() => toast('Link copied')) },
    { label: 'Duplicate', action: () => duplicateDial(d) },
    ...(others.length ? ['-', { heading: 'Move to' }, ...others.map((g) => ({ label: g.name, action: () => moveDialToGroup(d.id, g.id) }))] : []),
    '-',
    { label: 'Delete', danger: true, action: () => deleteDial(d) },
  ]);
}

function gridMenu(e) {
  const dials = groupDials();
  showMenu(e.clientX, e.clientY, [
    { label: 'Add dial…', action: () => openEditor(null) },
    { label: 'New group…', action: () => openGroupEditor(null) },
    '-',
    { label: 'Open all in new tabs', action: () => openAll(dials), disabled: !dials.length },
    { label: 'Refresh all thumbnails', action: () => refreshThumbs(dials), disabled: !dials.length },
    '-',
    { label: 'Settings', action: () => chrome.runtime.openOptionsPage() },
  ]);
}

/* ---------- Grid interactions & drag and drop ---------- */

function isExternalLink(e) {
  const types = e.dataTransfer?.types || [];
  return !dragDialId && !dragGroupId && (types.includes('application/x-fv-link') || types.includes('text/uri-list'));
}

function readDroppedLink(e) {
  const dt = e.dataTransfer;
  const own = dt.getData('application/x-fv-link');
  if (own) {
    try {
      return JSON.parse(own);
    } catch {}
  }
  const url = (dt.getData('text/uri-list') || '').split(/\r?\n/).find((l) => l && !l.startsWith('#')) || dt.getData('text/plain');
  if (!url || !looksLikeUrl(url.trim())) return null;
  let title = '';
  const html = dt.getData('text/html');
  if (html) title = new DOMParser().parseFromString(html, 'text/html').body.textContent.trim();
  return { url: S.fixUrl(url.trim()), title: title.slice(0, 120) };
}

function clearDropMarks() {
  document.querySelectorAll('.drop-before, .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
  $('#grid').classList.remove('drop-target');
}

function dropPosition(e) {
  const target = e.target.closest('.dial[data-id]:not(.add-tile)');
  if (!target || !target.dataset.id || target.dataset.id === dragDialId) return null;
  const r = target.getBoundingClientRect();
  return { id: target.dataset.id, after: e.clientX > r.left + r.width / 2, node: target };
}

async function placeDial(dial, targetId, after) {
  await S.updateData((d) => {
    const existing = d.dials.findIndex((x) => x.id === dial.id);
    const item = existing >= 0 ? d.dials.splice(existing, 1)[0] : dial;
    item.groupId = currentGroupId;
    let to = targetId ? d.dials.findIndex((x) => x.id === targetId) : -1;
    if (to < 0) {
      d.dials.push(item);
      return;
    }
    if (after) to++;
    d.dials.splice(to, 0, item);
  });
}

function setupGrid() {
  const grid = $('#grid');
  const main = $('#app');

  grid.addEventListener('click', (e) => {
    const node = e.target.closest('.dial');
    if (!node) return;
    e.preventDefault();
    if (node.classList.contains('add-tile')) return openEditor(null);
    const d = findDial(node.dataset.id);
    if (!d) return;
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'edit') return openEditor(d);
    if (action === 'delete') return deleteDial(d);
    if (e.ctrlKey || e.metaKey) openDial(d, 'background');
    else if (e.shiftKey) openDial(d, 'window');
    else openDial(d);
  });

  grid.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    const node = e.target.closest('.dial[data-id]');
    const d = node && findDial(node.dataset.id);
    if (!d) return;
    e.preventDefault();
    openDial(d, 'background');
  });

  main.addEventListener('contextmenu', (e) => {
    if (e.target.closest('input, .group, .groups')) return;
    e.preventDefault();
    const node = e.target.closest('.dial[data-id]');
    const d = node && findDial(node.dataset.id);
    if (d) dialMenu(e, d);
    else gridMenu(e);
  });

  grid.addEventListener('dragstart', (e) => {
    const node = e.target.closest('.dial[data-id]');
    if (!node || !node.dataset.id) return;
    dragDialId = node.dataset.id;
    node.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/uri-list', findDial(dragDialId).url);
  });

  grid.addEventListener('dragend', () => {
    dragDialId = null;
    clearDropMarks();
    renderAll();
  });

  main.addEventListener('dragover', (e) => {
    if (!dragDialId && !isExternalLink(e)) return;
    e.preventDefault();
    clearDropMarks();
    if (!dragDialId) grid.classList.add('drop-target');
    const pos = dropPosition(e);
    if (pos) pos.node.classList.add(pos.after ? 'drop-after' : 'drop-before');
  });

  main.addEventListener('dragleave', (e) => {
    if (!main.contains(e.relatedTarget)) clearDropMarks();
  });

  main.addEventListener('drop', async (e) => {
    if (e.target.closest('.group')) return;
    e.preventDefault();
    const pos = dropPosition(e);
    clearDropMarks();
    if (dragDialId) {
      const d = findDial(dragDialId);
      if (d) await placeDial(d, pos?.id, pos?.after);
      return;
    }
    const link = readDroppedLink(e);
    if (!link) return;
    const dial = S.createDial({ ...link, groupId: currentGroupId });
    await placeDial(dial, pos?.id, pos?.after);
    toast(`Added “${dial.title}”`);
  });
}

/* ---------- Dial editor ---------- */

let editing = null;
let pendingImage = null;

function setupEditor() {
  const form = $('#dialForm');
  const f = (n) => form.elements.namedItem(n);

  form.addEventListener('input', (e) => {
    if (e.target.name === 'bgColor' || e.target.name === 'textColor') e.target.dataset.set = '1';
    updatePreview();
  });
  form.addEventListener('change', updatePreview);

  $('#resetColors').addEventListener('click', () => {
    f('bgColor').dataset.set = '0';
    f('textColor').dataset.set = '0';
    f('textColor').value = '#ffffff';
    updatePreview();
  });

  $('#imageFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    pendingImage = await S.resizeImage(file, 960, 600, { mode: 'contain', type: 'image/webp', quality: 0.9 });
    f('imageUrl').value = '';
    form.querySelector('input[name="thumbMode"][value="image"]').checked = true;
    e.target.value = '';
    updatePreview();
  });

  $('#captureNow').addEventListener('click', () => {
    if (editing) refreshThumbs([editing]);
  });

  $('#dialCancel').addEventListener('click', () => $('#dialEditor').close());
  $('#dialEditor').addEventListener('close', () => {
    editing = null;
    pendingImage = null;
  });

  $('#dialDelete').addEventListener('click', () => {
    const d = editing;
    $('#dialEditor').close();
    if (d) deleteDial(d);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = S.fixUrl(f('url').value);
    if (!url) return;
    const fields = formDial();
    const original = editing;
    const image = pendingImage;
    let id;
    if (original) {
      id = original.id;
      await S.updateData((d) => Object.assign(d.dials.find((x) => x.id === id), fields));
      const modeChanged = (original.thumbMode || 'auto') !== fields.thumbMode;
      const staleShot = fields.thumbMode === 'auto' && S.normalizeUrl(original.url) !== S.normalizeUrl(url);
      const imageReplaced = fields.thumbMode === 'image' && !image && fields.imageUrl && fields.imageUrl !== original.imageUrl;
      if (!image && (modeChanged || staleShot || imageReplaced)) await S.removeThumb(id);
    } else {
      id = (await S.addDial(fields)).id;
      if (fields.groupId !== currentGroupId) switchGroup(fields.groupId);
    }
    if (image) await S.setThumb(id, image);
    $('#dialEditor').close();
    if (!original && fields.thumbMode === 'auto' && settings.captureOnAdd) chrome.runtime.sendMessage({ type: 'refreshThumbs', ids: [id] });
  });
}

function formDial() {
  const form = $('#dialForm');
  const f = (n) => form.elements.namedItem(n);
  const url = S.fixUrl(f('url').value) || 'https://example.com';
  return {
    url,
    title: f('title').value.trim() || S.hostname(url),
    groupId: f('groupId').value,
    thumbMode: form.elements.thumbMode.value,
    imageUrl: f('imageUrl').value.trim(),
    bgColor: f('bgColor').dataset.set === '1' ? f('bgColor').value : '',
    textColor: f('textColor').dataset.set === '1' ? f('textColor').value : '',
  };
}

function updatePreview() {
  const form = $('#dialForm');
  const fields = formDial();
  for (const panel of form.querySelectorAll('.mode-panel')) panel.classList.toggle('show', panel.dataset.mode === fields.thumbMode);
  $('#captureNow').hidden = !editing;
  const override = pendingImage || (editing && (editing.thumbMode || 'auto') === fields.thumbMode ? undefined : null);
  const preview = dialElement({ ...fields, id: editing?.id || '' }, { preview: true, thumbOverride: override });
  preview.style.width = '100%';
  $('#dialPreview').replaceChildren(preview);
}

function openEditor(dial, defaults = {}) {
  closeMenu();
  editing = dial;
  pendingImage = null;
  const form = $('#dialForm');
  const f = (n) => form.elements.namedItem(n);
  form.reset();
  $('#dialFormTitle').textContent = dial ? 'Edit dial' : 'Add dial';
  f('url').value = dial?.url || defaults.url || '';
  f('title').value = dial?.title || defaults.title || '';
  const select = f('groupId');
  select.replaceChildren(...data.groups.map((g) => new Option(g.name, g.id)));
  select.value = dial?.groupId || currentGroupId;
  form.querySelector(`input[name="thumbMode"][value="${dial?.thumbMode || 'auto'}"]`).checked = true;
  f('imageUrl').value = dial?.imageUrl || '';
  f('bgColor').value = dial?.bgColor || '#3b5bdb';
  f('bgColor').dataset.set = dial?.bgColor ? '1' : '0';
  f('textColor').value = dial?.textColor || '#ffffff';
  f('textColor').dataset.set = dial?.textColor ? '1' : '0';
  $('#dialDelete').hidden = !dial;
  updatePreview();
  $('#dialEditor').showModal();
  f('url').focus();
}

/* ---------- Toolbar ---------- */

function setupToolbar() {
  $('#btnSidebar').addEventListener('click', () => toggleSidebar());
  $('#btnAdd').addEventListener('click', () => openEditor(null));
  $('#btnSettings').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('#btnLock').addEventListener('click', async () => {
    await S.lockNow();
    location.reload();
  });
}

/* ---------- Sidebar ---------- */

function setupSidebar() {
  const sb = $('#sidebar');
  for (const b of sb.querySelectorAll('.sb-tabs button')) {
    b.addEventListener('click', () => {
      state.sidebarTab = b.dataset.tab;
      S.setState({ sidebarTab: state.sidebarTab });
      $('#sbSearch').value = '';
      renderSidebar();
    });
  }
  let timer;
  $('#sbSearch').addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(renderSidebar, 150);
  });

  const zone = el('div', 'sb-hover-zone');
  document.body.append(zone);
  let openedByHover = false;
  zone.addEventListener('mouseenter', () => {
    if (!settings.sidebarHover || !settings.sidebarEnabled || document.body.classList.contains('sb-open')) return;
    openedByHover = true;
    toggleSidebar(true, false);
  });
  sb.addEventListener('mouseleave', () => {
    if (openedByHover) {
      openedByHover = false;
      toggleSidebar(false, false);
    }
  });
  sb.addEventListener('dragstart', () => {
    openedByHover = false;
  });

  if (state.sidebarOpen && settings.sidebarEnabled) toggleSidebar(true, false);
}

function toggleSidebar(force, persist = true) {
  const open = force ?? !document.body.classList.contains('sb-open');
  document.body.classList.toggle('sb-open', open);
  if (persist) S.setState({ sidebarOpen: open });
  if (open) renderSidebar();
}

function sidebarItem({ url, title, meta, onOpen }) {
  const a = el('a', 'sb-item');
  a.href = url;
  a.draggable = true;
  a.title = `${title || url}\n${url}`;
  const img = el('img');
  img.src = S.faviconUrl(url, 32);
  img.alt = '';
  a.append(img, el('span', '', title || url));
  if (meta) a.append(el('span', 'meta', meta));
  const add = el('button', 'add');
  add.title = 'Add as dial';
  add.innerHTML = icon('plus');
  add.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await S.addDial({ url, title, groupId: currentGroupId });
    toast(`Added “${title || S.hostname(url)}”`);
  });
  a.append(add);
  a.addEventListener('click', (e) => {
    e.preventDefault();
    if (onOpen) onOpen();
    else if (e.ctrlKey || e.metaKey) chrome.tabs.create({ url, active: false });
    else chrome.tabs.update({ url });
  });
  a.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    chrome.tabs.create({ url, active: false });
  });
  a.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-fv-link', JSON.stringify({ url, title }));
    e.dataTransfer.setData('text/uri-list', url);
  });
  return a;
}

const timeAgo = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
};

async function importFolderAsGroup(node) {
  const links = [];
  const walk = (n) => {
    if (n.url) links.push(n);
    n.children?.forEach(walk);
  };
  walk(node);
  if (!links.length) return toast('That folder has no bookmarks.');
  const id = S.uid();
  await S.updateData((d) => {
    d.groups.push({ id, name: node.title || 'Bookmarks', color: '' });
    for (const b of links) d.dials.push(S.createDial({ url: b.url, title: b.title, groupId: id }));
  });
  switchGroup(id);
  toast(`Imported ${links.length} bookmark(s) as “${node.title}”`);
}

function bookmarkTree(node, depth) {
  if (node.url) return sidebarItem({ url: node.url, title: node.title });
  const wrap = el('div', 'sb-folder' + (depth > 1 ? ' collapsed' : ''));
  const head = el('div', 'sb-item');
  head.innerHTML = `${icon('caret').replace('<svg', '<svg class="caret"')}${icon('folder')}`;
  head.append(el('span', '', node.title || 'Bookmarks'));
  const imp = el('button', 'add');
  imp.title = 'Import folder as a new group';
  imp.innerHTML = icon('plus');
  imp.addEventListener('click', (e) => {
    e.stopPropagation();
    importFolderAsGroup(node);
  });
  head.append(imp);
  head.addEventListener('click', () => wrap.classList.toggle('collapsed'));
  const kids = el('div', 'sb-children');
  for (const c of node.children || []) kids.append(bookmarkTree(c, depth + 1));
  wrap.append(head, kids);
  return wrap;
}

async function renderSidebar() {
  const tab = state.sidebarTab || 'bookmarks';
  for (const b of document.querySelectorAll('.sb-tabs button')) b.classList.toggle('active', b.dataset.tab === tab);
  const q = $('#sbSearch').value.trim().toLowerCase();
  const match = (...parts) => !q || parts.some((p) => (p || '').toLowerCase().includes(q));
  const out = [];

  if (tab === 'bookmarks') {
    if (q) {
      const results = await chrome.bookmarks.search(q);
      for (const b of results.filter((x) => x.url).slice(0, 200)) out.push(sidebarItem({ url: b.url, title: b.title }));
    } else {
      const [root] = await chrome.bookmarks.getTree();
      for (const c of root.children || []) out.push(bookmarkTree(c, 1));
    }
  } else if (tab === 'top') {
    const sites = await chrome.topSites.get();
    for (const s of sites.filter((x) => match(x.title, x.url))) out.push(sidebarItem(s));
  } else if (tab === 'closed') {
    const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 25 });
    for (const s of sessions) {
      if (s.tab && match(s.tab.title, s.tab.url)) {
        out.push(sidebarItem({ url: s.tab.url, title: s.tab.title, meta: timeAgo(s.lastModified * 1000), onOpen: () => chrome.sessions.restore(s.tab.sessionId) }));
      } else if (s.window) {
        const tabs = s.window.tabs.filter((t) => match(t.title, t.url));
        if (!tabs.length) continue;
        const head = el('div', 'sb-item');
        head.append(el('span', '', `Window · ${s.window.tabs.length} tabs`), el('span', 'meta', 'restore'));
        head.addEventListener('click', () => chrome.sessions.restore(s.window.sessionId));
        out.push(head);
        for (const t of tabs) out.push(sidebarItem({ url: t.url, title: t.title }));
      }
    }
  } else if (tab === 'history') {
    const items = await chrome.history.search({ text: q, startTime: 0, maxResults: 80 });
    for (const h of items) out.push(sidebarItem({ url: h.url, title: h.title, meta: timeAgo(h.lastVisitTime) }));
  } else if (tab === 'tabs') {
    const windows = await chrome.windows.getAll({ populate: true });
    windows.forEach((w, i) => {
      const tabs = w.tabs.filter((t) => match(t.title, t.url));
      if (!tabs.length) return;
      if (windows.length > 1) out.push(el('div', 'sb-heading', `Window ${i + 1}`));
      for (const t of tabs) {
        out.push(sidebarItem({ url: t.url || t.pendingUrl || '', title: t.title, onOpen: () => {
          chrome.tabs.update(t.id, { active: true });
          chrome.windows.update(t.windowId, { focused: true });
        } }));
      }
    });
  } else if (tab === 'apps') {
    for (const p of BROWSER_PAGES.filter((x) => match(x.title, x.url))) out.push(sidebarItem(p));
  }

  if (!out.length) out.push(el('p', 'muted small', 'Nothing here.'));
  $('#sbContent').replaceChildren(...out);
}

/* ---------- Keyboard shortcuts ---------- */

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMenu();
      if (document.body.classList.contains('sb-open') && !document.querySelector('dialog[open]')) toggleSidebar(false);
    }
    if (!settings.shortcuts || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest('input, textarea, select') || document.querySelector('dialog[open]')) return;
    const digit = /^Digit(\d)$/.exec(e.code) || /^Numpad(\d)$/.exec(e.code);
    if (digit) {
      const n = Number(digit[1]);
      const d = groupDials()[n === 0 ? 9 : n - 1];
      if (d) openDial(d, e.shiftKey ? 'background' : settings.openIn);
      return;
    }
    const key = e.key.toLowerCase();
    if (e.key === 'ArrowRight') cycleGroup(1);
    else if (e.key === 'ArrowLeft') cycleGroup(-1);
    else if (key === '/' && settings.showSearch) {
      e.preventDefault();
      $('#searchInput').focus();
    } else if (key === 'b' && settings.sidebarEnabled) toggleSidebar();
    else if (key === 'n') {
      e.preventDefault();
      openEditor(null);
    } else if (key === 'g') {
      e.preventDefault();
      openGroupEditor(null);
    } else if (key === 'l' && settings.lockEnabled) $('#btnLock').click();
  });
}

/* ---------- Context menu & toast ---------- */

function showMenu(x, y, items) {
  const menu = $('#menu');
  menu.replaceChildren();
  for (const item of items) {
    if (item === '-') menu.append(el('hr'));
    else if (item.heading) menu.append(el('div', 'label', item.heading));
    else {
      const b = el('button', item.danger ? 'danger' : '', item.label);
      b.disabled = !!item.disabled;
      if (item.disabled) b.style.opacity = '0.45';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenu();
        if (!item.disabled) item.action();
      });
      menu.append(b);
    }
  }
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;
}

function closeMenu() {
  $('#menu').hidden = true;
}

let toastTimer;
let toastExpire;

function toast(message, { action, onAction, onExpire } = {}) {
  const t = $('#toast');
  clearTimeout(toastTimer);
  toastExpire?.();
  toastExpire = onExpire || null;
  t.replaceChildren(el('span', '', message));
  if (action) {
    const b = el('button', '', action);
    b.addEventListener('click', () => {
      toastExpire = null;
      t.hidden = true;
      onAction();
    });
    t.append(b);
  }
  t.hidden = false;
  toastTimer = setTimeout(() => {
    t.hidden = true;
    toastExpire?.();
    toastExpire = null;
  }, action ? 6000 : 2500);
}
