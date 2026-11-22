const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = win => new Promise(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)));

async function fixture(href = '/watch?v=dQw4w9WgXcQ', openMode = 'thumbnail', { deferReturn = false } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body><ytd-app><header>Header</header><ytd-page-manager>
    <ytd-browse><ytd-video-renderer><a id="thumbnail" href="${href}"><img alt="Video"></a><div class="meta"><span>Video title</span><ytd-menu-renderer></ytd-menu-renderer></div></ytd-video-renderer></ytd-browse>
    <ytd-watch-flexy hidden><div id="primary" style="overflow:hidden;contain:paint"><div id="player"><div id="movie_player" tabindex="-1"><div class="html5-video-container"><video class="html5-main-video"></video></div><button>Play</button></div></div><div id="comments">Comments</div></div></ytd-watch-flexy>
    </ytd-page-manager></ytd-app></body></html>`, {
    url: 'https://www.youtube.com/results?search_query=test', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window;
  const browse = w.document.querySelector('ytd-browse');
  browse.getBoundingClientRect = () => ({ top: -300, left: 240, width: 1040, height: 2000 });
  w.scrollTo = (x, y) => {
    const point = typeof x === 'object' ? { x: x.left, y: x.top } : { x, y };
    w.restoredScroll = point;
    w.scrollY = point.y;
  };
  Object.defineProperty(w, 'scrollY', { value: 356, writable: true });
  const listeners = [];
  w.chrome = { storage: { local: { get: async () => ({ settings: { openMode, size: 70, darkness: 80 } }) },
    onChanged: { addListener: fn => listeners.push(fn) } } };
  w.eval(source('shared.js'));
  w.eval(source('main.js'));
  w.eval(source('content.js'));
  await new Promise(resolve => setImmediate(resolve));
  const watch = w.document.querySelector('ytd-watch-flexy');
  const navigate = url => {
    w.history.pushState({}, '', url);
    browse.hidden = true;
    watch.hidden = false;
    watch.append(w.document.createElement('span'));
    w.document.dispatchEvent(new w.CustomEvent('yt-navigate-finish'));
  };
  w.document.addEventListener('click', event => {
    if (!event.defaultPrevented && event.target.closest('a')) {
      event.preventDefault(); navigate(event.target.closest('a').href);
    }
  });
  w.document.querySelector('ytd-app').addEventListener('yt-navigate', event => {
    navigate(event.detail.endpoint.commandMetadata.webCommandMetadata.url);
  });
  const finishReturn = () => {
    browse.hidden = false; watch.hidden = true;
    w.document.dispatchEvent(new w.CustomEvent('yt-navigate-finish'));
  };
  w.addEventListener('popstate', () => {
    if (w.location.pathname !== '/watch' && !deferReturn) finishReturn();
  });
  return { dom, w, browse, watch, listeners, finishReturn, click: options => w.document.querySelector('img').dispatchEvent(
    new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...options })) };
}

test('normal thumbnail keeps the original player and closing restores the browse page', async () => {
  const f = await fixture();
  try {
    const player = f.w.document.querySelector('#movie_player');
    f.click();
    await tick(f.w);
    assert.equal(f.w.location.pathname, '/watch');
    assert.equal(f.w.document.querySelector('[data-ypo-player]'), player);
    assert.equal(player.parentElement.id, 'player', 'player is not reparented');
    assert.equal(f.browse.inert, true);
    assert.equal(f.watch.getAttribute('role'), 'dialog');
    assert.ok(player.style.getPropertyValue('--ypo-width').endsWith('px'));
    f.w.document.querySelector('#ypo-toolbar button:last-child').click();
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(f.w.location.pathname, '/results');
    assert.equal(f.w.document.querySelector('#ypo-shade'), null);
    assert.equal(f.w.document.querySelector('[data-ypo-player]'), null);
    assert.equal(f.watch.hasAttribute('role'), false);
    assert.ok(!f.browse.inert);
    assert.deepEqual(f.w.restoredScroll, { x: 0, y: 356 });
  } finally { f.dom.window.close(); }
});

test('closing dismisses the video immediately while the original feed stays visible until routing finishes', async () => {
  const f = await fixture('/watch?v=dQw4w9WgXcQ', 'thumbnail', { deferReturn: true });
  try {
    const style = f.w.document.createElement('style');
    style.textContent = source('overlay.css');
    f.w.document.head.append(style);
    f.click(); await tick(f.w);
    const root = f.w.document.documentElement;
    const player = f.w.document.querySelector('[data-ypo-player]');
    let stopped = 0;
    player.stopVideo = () => stopped++;
    f.w.document.querySelector('#ypo-toolbar button:last-child').click();
    assert.equal(f.w.document.querySelector('#ypo-shade, #ypo-toolbar, #ypo-status'), null);
    assert.equal(root.hasAttribute('data-ypo-closing'), true);
    assert.equal(root.hasAttribute('data-ypo-open'), true, 'retain the original feed pin during return');
    assert.equal(f.w.document.querySelector('[data-ypo-background]'), f.browse);
    assert.equal(f.w.getComputedStyle(f.browse).position, 'fixed');
    assert.equal(f.w.getComputedStyle(f.browse).top, 'var(--ypo-background-top)');
    assert.equal(f.browse.style.getPropertyValue('--ypo-background-top'), '-300px');
    assert.equal(f.w.getComputedStyle(f.watch).display, 'none');
    assert.ok(!f.browse.inert, 'feed can accept another video request while returning');
    assert.ok(stopped > 0, 'ordinary close stops playback immediately');
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(f.w.location.pathname, '/results');
    assert.equal(root.hasAttribute('data-ypo-closing'), true, 'URL restoration alone does not unpin the feed');
    f.finishReturn(); await tick(f.w);
    assert.equal(root.hasAttribute('data-ypo-closing'), false);
    assert.equal(root.hasAttribute('data-ypo-open'), false);
    assert.equal(f.w.document.querySelector('[data-ypo-background]'), null);
    assert.equal(f.w.scrollY, 356);
  } finally { f.dom.window.close(); }
});

test('unchanged and equivalent feed data do not trigger renderer setters on return', async () => {
  for (const equivalentCopy of [false, true]) {
    const f = await fixture();
    try {
      let feedData = { cards: ['first', 'second'], continuation: 'next' };
      let writes = 0;
      Object.defineProperty(f.browse, 'data', { configurable: true, get: () => feedData, set: value => {
        writes++; feedData = value;
      } });
      f.click(); await tick(f.w);
      if (equivalentCopy) {
        // Different object identities and property order represent the same feed.
        feedData = { continuation: 'next', cards: ['first', 'second'] };
      }
      f.w.document.querySelector('#ypo-shade').click();
      await new Promise(resolve => setTimeout(resolve, 80));
      await tick(f.w);
      assert.equal(writes, 0, equivalentCopy ? 'equivalent replacement does not redraw cards' : 'intact feed does not redraw cards');
    } finally { f.dom.window.close(); }
  }
});

test('an in-place feed change is restored once without repeated renderer writes', async () => {
  const f = await fixture();
  try {
    let feedData = { cards: ['first', 'second'], continuation: 'next' };
    let writes = 0;
    Object.defineProperty(f.browse, 'data', { configurable: true, get: () => feedData, set: value => {
      writes++; feedData = value;
    } });
    f.click(); await tick(f.w);
    feedData.cards[0] = 'changed-in-place';
    feedData.continuation = 'changed-next';
    f.w.document.querySelector('#ypo-shade').click();
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.deepEqual(Array.from(feedData.cards), ['first', 'second']);
    assert.equal(feedData.continuation, 'next');
    assert.equal(writes, 1);
    await tick(f.w);
    assert.equal(writes, 1, 'restored data should remain untouched on later frames');
  } finally { f.dom.window.close(); }
});

test('changed feed data is restored before immediate dismissal reveals the source cards', async () => {
  const f = await fixture('/watch?v=dQw4w9WgXcQ', 'thumbnail', { deferReturn: true });
  try {
    let feedData = { cards: ['original'] };
    const list = f.w.document.createElement('div');
    list.textContent = 'original';
    f.browse.append(list);
    Object.defineProperty(f.browse, 'data', { configurable: true, get: () => feedData, set: value => {
      feedData = value; list.textContent = value.cards.join(',');
    } });
    f.click(); await tick(f.w);
    f.browse.data = { cards: ['different-recommendation'] };
    f.w.document.querySelector('#ypo-shade').click();
    assert.equal(list.textContent, 'original', 'never expose changed cards during the return transition');
    await new Promise(resolve => setTimeout(resolve, 80));
    f.finishReturn(); await tick(f.w);
    assert.equal(list.textContent, 'original');
  } finally { f.dom.window.close(); }
});

test('a new overlay request during delayed closing opens after return in both launch modes', async () => {
  for (const openMode of ['button', 'thumbnail']) {
    const f = await fixture('/watch?v=dQw4w9WgXcQ', openMode, { deferReturn: true });
    try {
      const second = f.w.document.createElement('ytd-video-renderer');
      second.innerHTML = '<a id="thumbnail" href="/watch?v=abcdefghijk"><img></a><div><ytd-menu-renderer></ytd-menu-renderer></div>';
      f.browse.append(second);
      await tick(f.w);
      const launch = card => card.querySelector(openMode === 'button' ? '.ypo-thumbnail-button' : 'img').click();
      launch(f.browse.querySelector('ytd-video-renderer')); await tick(f.w);
      f.w.document.querySelector('#ypo-shade').click();
      launch(second);
      assert.equal(f.w.document.querySelector('#ypo-toolbar'), null, 'wait for source routing before opening the queued video');
      await new Promise(resolve => setTimeout(resolve, 80));
      f.finishReturn(); await tick(f.w);
      assert.equal(new URL(f.w.location.href).searchParams.get('v'), 'abcdefghijk', openMode);
      assert.equal(f.w.document.documentElement.hasAttribute('data-ypo-closing'), false);
      assert.ok(f.w.document.querySelector('#ypo-toolbar'));
      await new Promise(resolve => setTimeout(resolve, 1600));
      assert.ok(f.w.document.querySelector('#ypo-toolbar'), 'the previous return timeout cannot close the new overlay');
    } finally { f.dom.window.close(); }
  }
});

test('an unrelated navigation during delayed close releases the pinned feed and discards queued playback', async () => {
  const f = await fixture('/watch?v=dQw4w9WgXcQ', 'button', { deferReturn: true });
  try {
    let feedData = { cards: ['original-source'] };
    let writes = 0;
    Object.defineProperty(f.browse, 'data', { configurable: true, get: () => feedData, set: value => {
      writes++; feedData = value;
    } });
    await tick(f.w);
    const launch = f.browse.querySelector('.ypo-thumbnail-button');
    launch.click(); await tick(f.w);
    f.w.document.querySelector('#ypo-shade').click();
    launch.click();
    await new Promise(resolve => setTimeout(resolve, 80));
    f.w.history.replaceState({}, '', '/feed/subscriptions');
    f.finishReturn(); await tick(f.w);
    const root = f.w.document.documentElement;
    assert.equal(f.w.location.pathname, '/feed/subscriptions');
    assert.equal(root.hasAttribute('data-ypo-open'), false);
    assert.equal(root.hasAttribute('data-ypo-closing'), false);
    assert.equal(f.w.document.querySelector('[data-ypo-background], [data-ypo-player], #ypo-toolbar'), null);
    assert.equal(f.browse.style.getPropertyValue('--ypo-background-top'), '');
    assert.ok(!f.browse.inert);
    feedData = { cards: ['fresh-after-other-browsing'] };
    f.w.history.replaceState({}, '', '/results?search_query=test');
    f.finishReturn(); await tick(f.w);
    assert.deepEqual(Array.from(feedData.cards), ['fresh-after-other-browsing'], 'a later native visit must not revive an abandoned snapshot');
    assert.equal(writes, 0);
  } finally { f.dom.window.close(); }
});

test('a slow native return stays pinned through the fallback and can settle without a finish event', async () => {
  const f = await fixture('/watch?v=dQw4w9WgXcQ', 'thumbnail', { deferReturn: true });
  try {
    f.click(); await tick(f.w);
    f.w.document.querySelector('#ypo-shade').click();
    await new Promise(resolve => setTimeout(resolve, 1700));
    const root = f.w.document.documentElement;
    assert.equal(f.w.location.pathname, '/results');
    assert.equal(f.browse.hidden, true, 'native source rendering has not settled');
    assert.equal(root.hasAttribute('data-ypo-closing'), true, 'the fallback must not expose a blank native page');
    assert.equal(f.w.document.querySelector('[data-ypo-background]'), f.browse);
    // A renderer can become ready without YouTube dispatching navigate-finish.
    f.browse.hidden = false;
    f.watch.hidden = true;
    await tick(f.w);
    assert.equal(root.hasAttribute('data-ypo-closing'), false);
    assert.equal(root.hasAttribute('data-ypo-open'), false);
    assert.equal(f.w.scrollY, 356);
  } finally { f.dom.window.close(); }
});

test('closing restores saved feed data and loaded continuations after YouTube refreshes the renderer', async () => {
  const f = await fixture();
  try {
    let feedData = { cards: ['first', 'second', 'loaded-more'], continuation: 'original-next' };
    const list = f.w.document.createElement('div');
    f.browse.append(list);
    Object.defineProperty(f.browse, 'data', { configurable: true, get: () => feedData, set: value => {
      feedData = value;
      list.textContent = value.cards.join(',');
    } });
    f.browse.data = feedData;
    f.click(); await tick(f.w);
    // In-place mutation must not corrupt the saved source snapshot.
    feedData.cards[0] = 'changed';
    f.browse.data = { cards: ['new-recommendation'], continuation: 'new-next' };
    f.w.document.querySelector('#ypo-shade').click();
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(list.textContent, 'first,second,loaded-more');
    assert.equal(f.browse.data.continuation, 'original-next');
    // Catch another asynchronous data replacement after navigate-finish.
    f.browse.data = { cards: ['late-refresh'], continuation: 'late-next' };
    await tick(f.w);
    assert.equal(list.textContent, 'first,second,loaded-more');
    f.w.dispatchEvent(new f.w.WheelEvent('wheel'));
    f.browse.data = { cards: ['user-loaded-more'], continuation: 'user-next' };
    await tick(f.w);
    assert.equal(list.textContent, 'user-loaded-more');
  } finally { f.dom.window.close(); }
});

test('fullscreen on a YouTube page ancestor expands only the visible player and restores the overlay on exit', async () => {
  const f = await fixture();
  try {
    f.click(); await tick(f.w);
    const doc = f.w.document;
    const player = doc.querySelector('[data-ypo-player]');
    const parent = player.parentElement;
    const width = player.style.getPropertyValue('--ypo-width');
    let fullscreenElement = null;
    Object.defineProperty(doc, 'fullscreenElement', { configurable: true, get: () => fullscreenElement });
    let resized = 0;
    player.setSize = () => resized++;
    const style = doc.createElement('style');
    style.textContent = source('overlay.css');
    doc.head.append(style);
    fullscreenElement = doc.documentElement;
    doc.dispatchEvent(new f.w.Event('fullscreenchange'));
    await tick(f.w);
    assert.equal(doc.documentElement.hasAttribute('data-ypo-fullscreen'), true);
    assert.equal(f.w.getComputedStyle(player).transform, 'none');
    assert.equal(f.w.getComputedStyle(player).width, `${f.w.innerWidth}px`);
    assert.equal(f.w.getComputedStyle(doc.querySelector('#ypo-toolbar')).display, 'none');
    assert.ok(resized > 0, 'native player is resized during fullscreen');
    fullscreenElement = null;
    doc.dispatchEvent(new f.w.Event('fullscreenchange'));
    await tick(f.w);
    assert.equal(doc.documentElement.hasAttribute('data-ypo-fullscreen'), false);
    assert.equal(player.parentElement, parent);
    assert.equal(player.style.getPropertyValue('--ypo-width'), width);
    assert.notEqual(f.w.getComputedStyle(doc.querySelector('#ypo-toolbar')).display, 'none');
    assert.ok(doc.querySelector('#ypo-shade'));
  } finally { f.dom.window.close(); }
});

test('overlay displays current title, formatted publication date and exact view count', async () => {
  const f = await fixture();
  try {
    const player = f.w.document.querySelector('#movie_player');
    player.getPlayerResponse = () => ({
      videoDetails: { videoId: 'dQw4w9WgXcQ', title: 'A video title', viewCount: '1234567' },
      microformat: { playerMicroformatRenderer: { publishDate: '2026-10-29' } }
    });
    f.click(); await tick(f.w);
    assert.equal(f.w.document.querySelector('#ypo-video-title').textContent, 'A video title');
    const info = f.w.document.querySelector('#ypo-video-info');
    assert.match(info.textContent, /2026-10-29, Thu/);
    assert.match(info.textContent, /1,234,567 views/);
    assert.equal(info.hidden, false);
  } finally { f.dom.window.close(); }
});

test('live metadata uses the current watching count without showing a planned publication date', async () => {
  const f = await fixture();
  try {
    f.watch.setAttribute('video-id', 'dQw4w9WgXcQ');
    f.watch.data = { contents: { twoColumnWatchNextResults: { results: { results: { contents: [
      { videoPrimaryInfoRenderer: { relativeDateText: { simpleText: 'Started streaming 2 hours ago' } } }
    ] } } } } };
    f.watch.innerHTML += '<span class="view-count" aria-label="4,321 watching now">all counter digits</span>';
    const player = f.w.document.querySelector('#movie_player');
    player.getPlayerResponse = () => ({
      videoDetails: { videoId: 'dQw4w9WgXcQ', title: 'Live now', isLive: true, isLiveContent: true, viewCount: '1000000' },
      microformat: { playerMicroformatRenderer: { publishDate: '2026-10-29', liveBroadcastDetails: { startTimestamp: '2026-10-29T00:00:00Z' } } }
    });
    f.click(); await tick(f.w);
    assert.equal(f.w.document.querySelector('#ypo-video-info').textContent, '4,321 watching nowStarted streaming 2 hours ago');
  } finally { f.dom.window.close(); }
});

test('button mode leaves ordinary thumbnails alone and adds a sibling button', async () => {
  const f = await fixture('/watch?v=dQw4w9WgXcQ', 'button');
  try {
    await tick(f.w);
    const control = f.w.document.querySelector('.ypo-thumbnail-button');
    assert.ok(control);
    assert.equal(control.closest('a'), null, 'button is not nested in a link');
    assert.equal(control.nextElementSibling.tagName.toLowerCase(), 'ytd-menu-renderer');
    assert.equal(control.parentElement.className, 'meta');
    f.click(); await tick(f.w);
    assert.equal(f.w.location.pathname, '/watch');
    assert.equal(f.w.document.querySelector('#ypo-shade'), null);
  } finally { f.dom.window.close(); }
});

test('modern div-based home cards put the action beside their metadata menu', async () => {
  const f = await fixture('/watch?v=dQw4w9WgXcQ', 'button');
  try {
    const card = f.w.document.createElement('div');
    card.className = 'yt-lockup-view-model';
    card.innerHTML = '<a class="yt-lockup-view-model__content-image" href="/watch?v=abcdefghijk"><img></a><div class="yt-lockup-metadata-view-model"><div>Title</div><div class="yt-lockup-metadata-view-model__menu-button"><button aria-label="More actions"></button></div></div>';
    f.browse.append(card);
    await tick(f.w);
    const control = card.querySelector('.ypo-thumbnail-button');
    assert.ok(control);
    assert.equal(control.nextElementSibling.className, 'yt-lockup-metadata-view-model__menu-button');
  } finally { f.dom.window.close(); }
});

test('unrecognized card wrappers support aria-haspopup=true menu buttons', async () => {
  const f = await fixture('/watch?v=dQw4w9WgXcQ', 'button');
  try {
    const card = f.w.document.createElement('article');
    card.innerHTML = '<div><a href="/watch?v=abcdefghijk"><img></a></div><div><span>Title</span><button aria-haspopup="true">More actions</button></div>';
    f.browse.append(card);
    await tick(f.w);
    const control = card.querySelector('.ypo-thumbnail-button');
    assert.ok(control);
    assert.equal(control.nextElementSibling.getAttribute('aria-haspopup'), 'true');
  } finally { f.dom.window.close(); }
});

test('overlay button opens the native player, including Shorts', async () => {
  for (const href of ['/watch?v=dQw4w9WgXcQ', '/shorts/dQw4w9WgXcQ']) {
    const f = await fixture(href, 'button');
    try {
      await tick(f.w);
      f.w.document.querySelector('.ypo-thumbnail-button').click();
      await tick(f.w);
      assert.equal(f.w.location.pathname, '/watch');
      assert.ok(f.w.document.querySelector('[data-ypo-player]'));
    } finally { f.dom.window.close(); }
  }
});

test('thumbnail buttons track dynamically added cards and disappear when mode changes', async () => {
  const f = await fixture('/watch?v=dQw4w9WgXcQ', 'button');
  try {
    await tick(f.w);
    const card = f.w.document.createElement('ytd-video-renderer');
    card.innerHTML = '<a id="thumbnail" href="/watch?v=abcdefghijk"><img></a><div><ytd-menu-renderer></ytd-menu-renderer></div>';
    f.browse.append(card);
    await tick(f.w);
    assert.equal(f.w.document.querySelectorAll('.ypo-thumbnail-button').length, 2);
    f.listeners[0]({ settings: { newValue: { openMode: 'thumbnail' } } }, 'local');
    await tick(f.w);
    assert.equal(f.w.document.querySelectorAll('.ypo-thumbnail-button').length, 0);
    f.listeners[0]({ settings: { newValue: { openMode: 'button' } } }, 'local');
    await tick(f.w);
    assert.equal(f.w.document.querySelectorAll('.ypo-thumbnail-button').length, 2);
    await tick(f.w);
    assert.equal(f.w.document.querySelectorAll('.ypo-thumbnail-button').length, 2);
  } finally { f.dom.window.close(); }
});

test('playing thumbnail preview leaves the overlay button beside the card menu', async () => {
  const f = await fixture('/watch?v=dQw4w9WgXcQ', 'button');
  try {
    const preview = f.w.document.createElement('ytd-video-preview');
    preview.style.position = 'fixed';
    preview.innerHTML = '<a href="/watch?v=dQw4w9WgXcQ"><video></video></a>';
    f.w.document.body.append(preview);
    await tick(f.w);
    assert.equal(preview.querySelector('.ypo-thumbnail-button'), null);
    assert.equal(preview.hasAttribute('data-ypo-position-host'), false);
    f.browse.querySelector('.ypo-thumbnail-button').click();
    await tick(f.w);
    assert.ok(f.w.document.querySelector('[data-ypo-player]'));
  } finally { f.dom.window.close(); }
});

test('Shorts request normal watch navigation and use a portrait rectangle', async () => {
  const f = await fixture('/shorts/dQw4w9WgXcQ');
  try {
    f.click(); await tick(f.w);
    assert.equal(f.w.location.pathname, '/watch');
    const player = f.w.document.querySelector('[data-ypo-player]');
    assert.ok(parseFloat(player.style.getPropertyValue('--ypo-width')) < parseFloat(player.style.getPropertyValue('--ypo-height')));
  } finally { f.dom.window.close(); }
});

test('appearance settings apply live; disabling removes the overlay and keeps watch playback', async () => {
  const f = await fixture();
  try {
    f.click(); await tick(f.w);
    const player = f.w.document.querySelector('[data-ypo-player]');
    const before = parseFloat(player.style.getPropertyValue('--ypo-width'));
    f.listeners[0]({ settings: { newValue: { enabled: true, size: 30, darkness: 20 } } }, 'local');
    await tick(f.w);
    assert.ok(parseFloat(player.style.getPropertyValue('--ypo-width')) < before);
    assert.ok(f.w.document.querySelector('#ypo-shade').style.backgroundColor.includes('0.2'));
    f.listeners[0]({ settings: { newValue: { enabled: false } } }, 'local');
    assert.equal(f.w.document.querySelector('#ypo-shade'), null);
    assert.equal(f.w.location.pathname, '/watch');
    assert.ok(!f.browse.inert);
  } finally { f.dom.window.close(); }
});

test('modified click is not intercepted', async () => {
  const f = await fixture();
  try {
    f.click({ ctrlKey: true });
    assert.equal(f.w.document.querySelector('#ypo-shade'), null);
  } finally { f.dom.window.close(); }
});

test('Go to watch page removes only overlay presentation', async () => {
  const f = await fixture();
  try {
    f.click(); await tick(f.w);
    f.w.document.querySelector('#ypo-toolbar a').click();
    assert.equal(f.w.location.pathname, '/watch');
    assert.equal(f.w.document.querySelector('#ypo-toolbar'), null);
    assert.ok(!f.w.document.documentElement.hasAttribute('data-ypo-open'));
  } finally { f.dom.window.close(); }
});

test('explicit Picture in picture uses YouTube miniplayer, preserves playback and returns thumbnails', async () => {
  const f = await fixture('/watch?v=dQw4w9WgXcQ', 'button');
  try {
    await tick(f.w);
    f.w.document.querySelector('.ypo-thumbnail-button').click();
    await tick(f.w);
    const player = f.w.document.querySelector('[data-ypo-player]');
    let stopped = 0;
    player.stopVideo = () => stopped++;
    const native = f.w.document.createElement('button');
    native.className = 'ytp-miniplayer-button';
    native.addEventListener('click', () => {
      const mini = f.w.document.createElement('ytd-miniplayer');
      mini.setAttribute('active', '');
      mini.append(player);
      f.w.document.body.append(mini);
      f.w.history.back();
    });
    player.append(native);
    await tick(f.w);
    const pip = f.w.document.querySelector('#ypo-miniplayer');
    assert.equal(pip.disabled, false);
    pip.click();
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(f.w.document.querySelector('#ypo-toolbar'), null);
    assert.equal(f.w.location.pathname, '/results');
    assert.ok(f.w.document.querySelector('ytd-miniplayer[active]'));
    assert.equal(stopped, 0, 'intentional miniplayer handoff must preserve playback');
    assert.ok(f.browse.querySelector('.ypo-thumbnail-button'));
  } finally { f.dom.window.close(); }
});

test('ordinary close stops playback and dismisses a late automatic miniplayer', async () => {
  const f = await fixture();
  try {
    f.click(); await tick(f.w);
    const player = f.w.document.querySelector('[data-ypo-player]');
    let stopped = 0;
    player.stopVideo = () => stopped++;
    f.w.document.querySelector('#ypo-toolbar button:last-child').click();
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.ok(stopped > 0);
    const mini = f.w.document.createElement('ytd-miniplayer');
    mini.setAttribute('active', '');
    const close = f.w.document.createElement('button');
    close.className = 'ytp-miniplayer-close-button';
    close.addEventListener('click', () => mini.removeAttribute('active'));
    mini.append(close, player);
    f.w.document.body.append(mini);
    await tick(f.w);
    assert.equal(mini.hasAttribute('active'), false);
  } finally { f.dom.window.close(); }
});

test('player and metadata clicks keep the overlay open; clicking outside closes it', async () => {
  const f = await fixture();
  try {
    f.click(); await tick(f.w);
    let stopped = 0;
    f.w.document.querySelector('[data-ypo-player]').stopVideo = () => stopped++;
    for (const selector of ['#ypo-video-title', '#ypo-video-info', '#ypo-toolbar', '[data-ypo-player]']) {
      f.w.document.querySelector(selector).click();
      await tick(f.w);
      assert.ok(f.w.document.querySelector('#ypo-toolbar'), selector);
      assert.equal(stopped, 0, selector);
    }
    f.w.document.querySelector('#ypo-shade').click();
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.ok(stopped > 0);
    assert.equal(f.w.document.querySelector('#ypo-toolbar'), null);
    assert.equal(f.w.location.pathname, '/results');
  } finally { f.dom.window.close(); }
});

test('automatic miniplayer remains blocked beyond the former close timeout', async () => {
  const f = await fixture();
  try {
    f.click(); await tick(f.w);
    const player = f.w.document.querySelector('[data-ypo-player]');
    f.w.document.querySelector('#ypo-shade').click();
    await new Promise(resolve => setTimeout(resolve, 2700));
    const mini = f.w.document.createElement('ytd-miniplayer');
    mini.setAttribute('active', '');
    mini.append(player);
    f.w.document.body.append(mini);
    await tick(f.w);
    assert.equal(mini.hasAttribute('data-ypo-dismissed'), true);
  } finally { f.dom.window.close(); }
});

test('miniplayer stays available even when YouTube omits its toolbar control', async () => {
  const f = await fixture();
  try {
    f.click(); await tick(f.w);
    assert.equal(f.w.document.querySelector('#ypo-miniplayer').disabled, false);
    assert.equal(f.w.document.querySelector('#ypo-miniplayer').textContent, 'Miniplayer ↘');
    assert.match(f.w.document.querySelector('#ypo-toolbar a').textContent, /^Go to watch page/);
  } finally { f.dom.window.close(); }
});

test('miniplayer fallback calls the available native method and navigates back without stopping playback', async () => {
  const f = await fixture();
  try {
    f.click(); await tick(f.w);
    const player = f.w.document.querySelector('[data-ypo-player]');
    let minimized = 0;
    let stopped = 0;
    player.stopVideo = () => stopped++;
    player.minimize = () => {
      minimized++;
      const mini = f.w.document.createElement('ytd-miniplayer');
      mini.setAttribute('active', '');
      mini.append(player);
      f.w.document.body.append(mini);
    };
    f.w.document.querySelector('#ypo-miniplayer').click();
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(minimized, 1);
    assert.equal(stopped, 0);
    assert.equal(f.w.location.pathname, '/results');
    assert.ok(f.w.document.querySelector('ytd-miniplayer[active]'));
  } finally { f.dom.window.close(); }
});

test('thumbnail button is reattached after YouTube replaces card contents', async () => {
  const f = await fixture('/watch?v=dQw4w9WgXcQ', 'button');
  try {
    await tick(f.w);
    const control = f.browse.querySelector('.ypo-thumbnail-button');
    control.remove();
    await tick(f.w);
    assert.equal(control.parentElement, f.browse.querySelector('.meta'));
    assert.equal(f.browse.querySelectorAll('.ypo-thumbnail-button').length, 1);
  } finally { f.dom.window.close(); }
});

test('disabled native miniplayer hides our action and enabling it shows it again', async () => {
  const f = await fixture();
  try {
    f.click(); await tick(f.w);
    const native = f.w.document.createElement('button');
    native.className = 'ytp-miniplayer-button';
    native.disabled = true;
    f.w.document.querySelector('[data-ypo-player]').append(native);
    await tick(f.w);
    const control = f.w.document.querySelector('#ypo-miniplayer');
    assert.equal(control.hidden, true);
    native.disabled = false;
    await tick(f.w);
    assert.equal(control.hidden, false);
    assert.equal(control.disabled, false);
  } finally { f.dom.window.close(); }
});

test('Shorts card places overlay action immediately before the three-dot menu', async () => {
  const f = await fixture('/shorts/dQw4w9WgXcQ', 'button');
  try {
    const card = f.w.document.createElement('ytm-shorts-lockup-view-model');
    card.innerHTML = '<a class="shortsLockupViewModelHostEndpoint" href="/shorts/abcdefghijk"><img></a><div><button aria-haspopup="menu">More</button></div>';
    f.browse.append(card);
    await tick(f.w);
    const control = card.querySelector('.ypo-thumbnail-button');
    assert.ok(control);
    assert.equal(control.nextElementSibling.textContent, 'More');
    assert.equal(card.querySelector('a').contains(control), false);
  } finally { f.dom.window.close(); }
});

test('watch link supports native middle-click without closing the overlay', async () => {
  const f = await fixture();
  try {
    f.click(); await tick(f.w);
    const link = f.w.document.querySelector('#ypo-toolbar a');
    assert.equal(link.href, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const event = new f.w.MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    assert.ok(f.w.document.querySelector('[data-ypo-player]'));
    const modified = new f.w.MouseEvent('click', { button: 0, ctrlKey: true, bubbles: true, cancelable: true });
    link.dispatchEvent(modified);
    assert.equal(modified.defaultPrevented, false);
    assert.ok(f.w.document.querySelector('[data-ypo-player]'));
  } finally { f.dom.window.close(); }
});

test('video ancestors stay visible and only other watch branches are concealed', async () => {
  const f = await fixture();
  try {
    f.click(); await tick(f.w);
    const player = f.w.document.querySelector('[data-ypo-player]');
    assert.ok(f.w.document.querySelector('#primary').hasAttribute('data-ypo-player-path'));
    assert.ok(f.w.document.querySelector('#comments').hasAttribute('data-ypo-concealed'));
    for (let node = player; node && node !== f.watch.parentElement; node = node.parentElement) {
      assert.equal(node.hasAttribute('data-ypo-concealed'), false);
    }
    f.w.document.querySelector('#ypo-toolbar a').click();
    assert.equal(f.w.document.querySelector('[data-ypo-player-path]'), null);
    assert.equal(f.w.document.querySelector('[data-ypo-concealed]'), null);
  } finally { f.dom.window.close(); }
});

test('scroll restoration survives a late YouTube reset and stops on user scrolling', async () => {
  const f = await fixture();
  try {
    f.click(); await tick(f.w);
    f.w.document.querySelector('#ypo-toolbar button:last-child').click();
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(f.w.scrollY, 356);
    f.w.scrollY = 0;
    await tick(f.w);
    assert.equal(f.w.scrollY, 356, 'correct a delayed site scroll reset');
    f.w.dispatchEvent(new f.w.WheelEvent('wheel'));
    f.w.scrollY = 99;
    await tick(f.w);
    assert.equal(f.w.scrollY, 99, 'respect scrolling initiated by the user');
  } finally { f.dom.window.close(); }
});
