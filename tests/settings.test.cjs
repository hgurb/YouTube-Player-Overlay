const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function settingsWindow(file, store, theme) {
  const dom = new JSDOM(source(file), { url: 'https://extension.test/' + file, runScripts: 'outside-only' });
  const w = dom.window;
  if (theme) w.localStorage.setItem('ypo-theme', theme);
  const system = { matches: true, addEventListener: (name, fn) => { system.onchange = fn; } };
  w.matchMedia = () => system;
  w.chrome = { storage: {
    local: {
      get: async () => ({ settings: store.settings }),
      set: async ({ settings }) => {
        store.settings = settings;
        for (const listener of store.listeners) listener({ settings: { newValue: settings } }, 'local');
      }
    },
    onChanged: { addListener: fn => store.listeners.push(fn) }
  }, runtime: { openOptionsPage: async () => { store.opened = true; } } };
  w.eval(source('shared.js'));
  w.eval(source('theme.js'));
  w.eval(source(file === 'popup.html' ? 'popup.js' : 'settings.js'));
  return { dom, w, system };
}

test('settings page saves and synchronizes opening mode, size and reset', async () => {
  const store = { settings: { enabled: true, size: 65, darkness: 85 }, listeners: [] };
  const popup = settingsWindow('options.html', store);
  const options = settingsWindow('options.html', store);
  try {
    await settle();
    const keepFeed = options.w.document.querySelector('#preserve-home-feed');
    assert.equal(keepFeed.checked, false);
    keepFeed.checked = true;
    keepFeed.dispatchEvent(new options.w.Event('input'));
    await settle();
    assert.equal(store.settings.preserveHomeFeed, true);
    assert.equal(popup.w.document.querySelector('#preserve-home-feed').checked, true);
    const size = options.w.document.querySelector('#size');
    size.value = '80';
    size.dispatchEvent(new options.w.Event('input'));
    await settle();
    assert.equal(store.settings.size, 80);
    assert.equal(popup.w.document.querySelector('#size').value, '80');
    assert.equal(options.w.document.querySelector('#size-value').value, '80%');
    const mode = options.w.document.querySelector('#open-mode');
    assert.equal(mode.value, 'button');
    mode.value = 'thumbnail';
    mode.dispatchEvent(new options.w.Event('input'));
    await settle();
    assert.equal(store.settings.openMode, 'thumbnail');
    assert.equal(popup.w.document.querySelector('#open-mode').value, 'thumbnail');
    popup.w.document.querySelector('#reset').click();
    await settle();
    assert.equal(options.w.document.querySelector('#size').value, '65');
    assert.equal(options.w.document.querySelector('#open-mode').value, 'button');
    assert.equal(options.w.document.querySelector('#preserve-home-feed').checked, false);
  } finally { popup.dom.window.close(); options.dom.window.close(); }
});

test('theme follows system until selected, persists, and accepts changes from other windows', async () => {
  const f = settingsWindow('options.html', { settings: {}, listeners: [] });
  try {
    await settle();
    const root = f.w.document.documentElement;
    const button = f.w.document.querySelector('#theme-toggle');
    assert.equal(root.dataset.theme, 'dark');
    assert.equal(button.getAttribute('aria-label'), 'Switch to light mode');
    f.system.matches = false; f.system.onchange();
    assert.equal(root.dataset.theme, 'light');
    button.click();
    assert.equal(root.dataset.theme, 'dark');
    assert.equal(f.w.localStorage.getItem('ypo-theme'), 'dark');
    f.system.onchange();
    assert.equal(root.dataset.theme, 'dark');
    f.w.dispatchEvent(new f.w.StorageEvent('storage', { key: 'ypo-theme', newValue: 'light' }));
    assert.equal(root.dataset.theme, 'light');
    assert.equal(button.title, 'Switch to dark mode');
  } finally { f.dom.window.close(); }
});

test('settings page is registered as a tab, and extension UI has no inline scripts', () => {
  const manifest = JSON.parse(source('manifest.json'));
  assert.deepEqual(manifest.options_ui, { page: 'options.html', open_in_tab: true });
  assert.equal(manifest.action.default_popup, 'popup.html');
  for (const file of ['options.html', 'popup.html']) {
    const dom = new JSDOM(source(file));
    const doc = dom.window.document;
    assert.equal(doc.querySelectorAll('script:not([src])').length, 0);
    if (file === 'options.html') assert.equal(doc.querySelector('.credit a').href, 'https://github.com/hgurb');
    for (const element of doc.querySelectorAll('script[src], link[rel=stylesheet]')) {
      assert.ok(fs.existsSync(path.join(__dirname, '..', element.getAttribute('src') ?? element.getAttribute('href'))));
    }
    dom.window.close();
  }
});

test('minimal popup has just appearance sliders and preserves full-page settings', async () => {
  const store = { settings: { enabled: false, preserveHomeFeed: true, openMode: 'thumbnail', size: 55, darkness: 60 }, listeners: [] };
  const f = settingsWindow('popup.html', store, 'light');
  try {
    await settle();
    const doc = f.w.document;
    assert.equal(doc.querySelectorAll('input').length, 2);
    assert.equal(doc.querySelectorAll('button, select, a').length, 1);
    doc.querySelector('#open-settings').click();
    await settle();
    assert.equal(store.opened, true);
    assert.equal(doc.querySelector('#theme-toggle'), null);
    assert.equal(doc.documentElement.dataset.theme, 'light');
    assert.equal(doc.querySelector('#size').value, '55');
    const size = doc.querySelector('#size');
    size.value = '80'; size.dispatchEvent(new f.w.Event('input'));
    await settle();
    assert.equal(store.settings.size, 80);
    assert.equal(store.settings.darkness, 60);
    assert.equal(store.settings.enabled, false);
    assert.equal(store.settings.preserveHomeFeed, true);
    assert.equal(store.settings.openMode, 'thumbnail');
    assert.equal(doc.querySelector('#preview').style.getPropertyValue('--size'), '80%');
    f.w.dispatchEvent(new f.w.StorageEvent('storage', { key: 'ypo-theme', newValue: 'dark' }));
    assert.equal(doc.documentElement.dataset.theme, 'dark');
  } finally { f.dom.window.close(); }
});
