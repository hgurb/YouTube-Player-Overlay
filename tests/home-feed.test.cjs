const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const wait = () => new Promise(resolve => setTimeout(resolve, 60));

function fixture(enabled = true, navigationAPI = false) {
  const dom = new JSDOM('<ytd-app><a id="logo" href="/">Home</a><ytd-page-manager><ytd-browse><a id="video" href="/watch?v=abcdefghijk">Video</a><div id="cards"></div></ytd-browse></ytd-page-manager></ytd-app>', {
    url: 'https://www.youtube.com/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window;
  if (navigationAPI) Object.defineProperty(w, 'navigation', { value: { get currentEntry() {
    return { key: w.history.state?.key ?? 'home-key', index: w.history.state?.index ?? (w.location.pathname === '/watch' ? 2 : 1) };
  } } });
  const source = w.document.querySelector('ytd-browse');
  let data = { cards: ['original', 'loaded-more'], continuation: 'next' };
  let writes = 0;
  Object.defineProperty(source, 'data', { get: () => data, set: value => {
    data = value; writes++;
    w.document.querySelector('#cards').textContent = value.cards.join(',');
  } });
  Object.defineProperty(w, 'scrollY', { value: 900, writable: true });
  w.scrollTo = ({ top }) => { w.scrollY = top; };
  w.eval(fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8'));
  const option = enabled => w.document.dispatchEvent(new w.CustomEvent('ypo:home-feed-option', { detail: enabled }));
  option(enabled);
  // Simulate YouTube's router after the extension's capture listener.
  w.document.addEventListener('click', event => event.preventDefault());
  const finish = () => w.document.dispatchEvent(new w.CustomEvent('yt-navigate-finish'));
  const open = () => {
    w.document.querySelector('#video').click();
    w.history.pushState({ native: 'watch' }, '', '/watch?v=abcdefghijk');
    source.hidden = true; finish();
    source.data = { cards: ['refreshed'], continuation: 'new' };
    w.scrollY = 0;
  };
  w.addEventListener('popstate', () => { source.hidden = false; finish(); });
  return { dom, w, source, open, finish, option, writes: () => writes };
}

test('Home preservation is off by default and ordinary Back remains native', async () => {
  const f = fixture(false);
  try {
    f.open(); f.w.history.back(); await wait();
    assert.equal(f.source.data.cards[0], 'refreshed');
    assert.equal(f.w.scrollY, 0);
    assert.equal(f.w.history.state, null, 'disabled option never stamps native history');
  } finally { f.dom.window.close(); }
});

test('Back restores the matching Home entry, continuations, scroll, and delayed replacements', async () => {
  const f = fixture();
  try {
    f.w.history.replaceState({ native: { retained: true } }, '');
    f.open(); f.w.history.back(); await wait();
    assert.deepEqual(Array.from(f.source.data.cards), ['original', 'loaded-more']);
    assert.equal(f.source.data.continuation, 'next');
    assert.equal(f.w.scrollY, 900);
    assert.equal(f.w.history.state.native.retained, true);
    f.source.data = { cards: ['late'], continuation: 'late' };
    await wait();
    assert.equal(f.source.data.cards[0], 'original');
    f.w.dispatchEvent(new f.w.WheelEvent('wheel'));
    f.source.data = { cards: ['user-loaded'], continuation: 'user' };
    await wait();
    assert.equal(f.source.data.cards[0], 'user-loaded');
  } finally { f.dom.window.close(); }
});

test('YouTube logo and non-history Home navigation keep the fresh feed', async () => {
  for (const logo of [true, false]) {
    const f = fixture();
    try {
      f.open();
      if (logo) f.w.document.querySelector('#logo').click();
      f.w.history.pushState({}, '', '/');
      f.source.hidden = false; f.finish(); await wait();
      assert.equal(f.source.data.cards[0], 'refreshed');
      assert.equal(f.w.scrollY, 0);
    } finally { f.dom.window.close(); }
  }
});

test('disabling the option on a video releases its Home backup', async () => {
  const f = fixture();
  try {
    f.open(); f.option(false);
    f.w.history.back(); await wait();
    assert.equal(f.source.data.cards[0], 'refreshed');
  } finally { f.dom.window.close(); }
});

test('Navigation API keys restore Back without modifying native history state', async () => {
  const f = fixture(true, true);
  try {
    f.w.history.replaceState({ key: 'home-key', index: 1, native: true }, '');
    f.open(); f.w.history.back(); await wait();
    assert.equal(f.source.data.cards[0], 'original');
    assert.deepEqual(f.w.history.state, { key: 'home-key', index: 1, native: true });
  } finally { f.dom.window.close(); }
});

test('Forward to the saved Home entry never restores its backup', async () => {
  const f = fixture(true, true);
  try {
    f.w.history.replaceState({ key: 'older-watch', index: 0 }, '', '/watch?v=oldervideo1');
    f.w.history.pushState({ key: 'home-key', index: 1 }, '', '/');
    f.open();
    f.w.history.go(-2); await wait();
    f.w.history.forward(); await wait();
    assert.equal(f.w.location.pathname, '/');
    assert.equal(f.source.data.cards[0], 'refreshed');
    assert.equal(f.w.scrollY, 0);
  } finally { f.dom.window.close(); }
});

test('onward navigation releases Home backup; going Back twice does not restore it', async () => {
  for (const next of ['/watch?v=secondvideo', '/feed/subscriptions']) {
    const f = fixture();
    try {
      f.open();
      f.w.history.pushState({}, '', next); f.finish();
      f.w.history.back(); await wait();
      f.w.history.back(); await wait();
      assert.equal(f.w.location.pathname, '/');
      assert.equal(f.source.data.cards[0], 'refreshed');
      assert.equal(f.w.scrollY, 0);
    } finally { f.dom.window.close(); }
  }
});

test('two tabs keep independent Home snapshots', async () => {
  const a = fixture(); const b = fixture();
  try {
    b.source.data = { cards: ['second-tab'], continuation: 'second-next' };
    a.open(); b.open();
    a.w.history.back(); await wait();
    assert.equal(a.source.data.cards[0], 'original');
    assert.equal(b.source.data.cards[0], 'refreshed');
    b.w.history.back(); await wait();
    assert.equal(b.source.data.cards[0], 'second-tab');
    assert.equal(a.source.data.cards[0], 'original');
  } finally { a.dom.window.close(); b.dom.window.close(); }
});
