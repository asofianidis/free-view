import * as S from './storage.js';

const $ = (sel) => document.querySelector(sel);

init();

async function init() {
  const [data, settings, [tab]] = await Promise.all([S.getData(), S.getSettings(), chrome.tabs.query({ active: true, currentWindow: true })]);
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.style.setProperty('--accent', settings.accent);

  $('#openNewtab').addEventListener('click', () => chrome.tabs.create({}));
  $('#openSettings').addEventListener('click', () => chrome.runtime.openOptionsPage());

  if (!(await S.isUnlocked(settings))) {
    $('#main').hidden = true;
    $('#locked').hidden = false;
    return;
  }

  const capturable = tab && /^https?:|^file:/.test(tab.url || '');
  let shot = '';
  if (capturable) {
    try {
      shot = await S.resizeImage(await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 90 }), 640, 400);
      const img = document.createElement('img');
      img.src = shot;
      img.alt = '';
      $('#preview').append(img);
    } catch {
      $('#preview').hidden = true;
    }
  } else {
    $('#preview').hidden = true;
  }

  $('#title').value = tab?.title || '';
  $('#url').value = capturable ? tab.url : '';
  const select = $('#group');
  select.replaceChildren(...data.groups.map((g) => new Option(g.name, g.id)));

  const existing = capturable ? S.findDialByUrl(data, tab.url) : null;
  select.value = existing?.groupId || data.defaultGroupId || data.groups[0].id;
  if (existing) {
    const g = data.groups.find((x) => x.id === existing.groupId);
    $('#title').value = existing.title;
    showStatus(`Already in “${g?.name}”.`);
    $('#save').textContent = 'Update dial';
    $('#remove').hidden = false;
  }

  $('#remove').addEventListener('click', async () => {
    await S.removeDials([existing.id]);
    window.close();
  });

  $('#save').addEventListener('click', async () => {
    const url = S.fixUrl($('#url').value);
    if (!url) return $('#url').focus();
    const fields = { url, title: $('#title').value.trim() || S.hostname(url), groupId: select.value };
    let id;
    if (existing) {
      id = existing.id;
      await S.updateData((d) => Object.assign(d.dials.find((x) => x.id === id), fields));
    } else {
      id = (await S.addDial(fields)).id;
    }
    const sameUrl = capturable && S.normalizeUrl(url) === S.normalizeUrl(tab.url);
    if (shot && sameUrl && (existing?.thumbMode || 'auto') === 'auto') await S.setThumb(id, shot);
    showStatus(existing ? 'Dial updated.' : 'Added!', true);
    setTimeout(() => window.close(), 700);
  });
}

function showStatus(text, ok = false) {
  const s = $('#status');
  s.textContent = text;
  s.className = 'status ' + (ok ? 'ok' : 'muted');
  s.hidden = false;
}
