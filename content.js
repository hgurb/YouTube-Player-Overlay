(() => {
  "use strict";
  if (location.pathname.startsWith("/embed/")) return;
  let settings = YPO.defaults;
  let session = null;
  let frame = 0;
  let cancelRestore = () => {};
  let miniplayerReturn = null;
  const root = document.documentElement;
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent(`ypo:${name}`, { detail }));
  const currentPath = () => location.pathname + location.search;
  const isWatch = () => location.pathname === "/watch";
  const thumbnailSelector = "a#thumbnail[href], a.yt-lockup-view-model__content-image[href], a.reel-item-endpoint[href], a.shortsLockupViewModelHostEndpoint[href], a[href*='/watch?']:has(img), a[href*='/shorts/']:has(img)";
  const thumbnailButtons = new Map();
  let thumbnailFrame = 0;
  const cardSelector = "yt-lockup-view-model, .yt-lockup-view-model, ytd-rich-item-renderer, ytd-rich-grid-media, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-reel-item-renderer, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, yt-shorts-lockup-view-model, .shortsLockupViewModelHost";
  const menuSelector = "ytd-menu-renderer, yt-menu-renderer, .yt-lockup-metadata-view-model__menu-button, .yt-lockup-view-model__menu-button, .shortsLockupViewModelHostMenu, .shortsLockupViewModelHostOutsideMetadataMenu, button[aria-haspopup='menu'], button[aria-haspopup='true'], button[aria-label='More actions' i], button[aria-label='Action menu' i], button[aria-label='More' i]";

  function findCardMenu(anchor) {
    // Modern YouTube uses ordinary divs with model classes as well as custom
    // elements. Walk local wrappers if the nearest recognized card has no menu.
    let candidate = anchor.closest(cardSelector) ?? anchor.parentElement;
    for (let depth = 0; candidate && depth < 8; depth++, candidate = candidate.parentElement) {
      if (candidate.matches("ytd-browse, ytd-search, ytd-page-manager, ytd-item-section-renderer, #contents, body")) break;
      const ids = new Set([...candidate.querySelectorAll("a[href*='/watch?'], a[href*='/shorts/']")]
        .map(a => YPO.videoLink(a.href)?.id).filter(Boolean));
      if (ids.size > 1) break; // Never borrow a different video's menu from the feed.
      const menu = [...candidate.querySelectorAll(menuSelector)].find(node => !anchor.contains(node) && !node.closest("a[href]"));
      if (menu) return menu;
    }
    return null;
  }

  function scheduleThumbnails() {
    if (!thumbnailFrame) thumbnailFrame = requestAnimationFrame(scanThumbnails);
  }
  function removeThumbnailButton(host, entry) {
    entry.button.remove();
    host.removeAttribute("data-ypo-thumbnail-host");
    host.removeAttribute("data-ypo-position-host");
    entry.menu.removeAttribute("data-ypo-card-menu");
    thumbnailButtons.delete(host);
  }
  function addThumbnailButton(host, anchor, menu) {
    menu.setAttribute("data-ypo-card-menu", "");
    if (thumbnailButtons.has(host)) {
      const entry = thumbnailButtons.get(host);
      entry.anchor = anchor;
      entry.menu = menu;
      host.setAttribute("data-ypo-thumbnail-host", "");
      // YouTube replaces preview/card contents when moving the player in/out of
      // its miniplayer. The host can survive while our child button is removed.
      if (entry.button.parentElement !== host || entry.button.nextElementSibling !== menu) host.insertBefore(entry.button, menu);
      return;
    }
    const control = button("", "Open in overlay", () => {});
    control.className = "ypo-thumbnail-button";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", "M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M3 3l6 6M21 3l-6 6M21 21l-6-6M3 21l6-6");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
    control.append(svg);
    host.setAttribute("data-ypo-thumbnail-host", "");
    host.insertBefore(control, menu); // In the metadata row, immediately before the native menu.
    thumbnailButtons.set(host, { button: control, anchor, menu });
  }
  function scanThumbnails() {
    thumbnailFrame = 0;
    if (session) return; // Preserve the invoker for focus restoration on close.
    const active = settings.enabled && settings.openMode === "button" && !isWatch() && !location.pathname.startsWith("/shorts/");
    for (const [host, entry] of thumbnailButtons) {
      if (!active || !host.isConnected || !entry.anchor.isConnected || !entry.menu.isConnected || !YPO.videoLink(entry.anchor.href)) removeThumbnailButton(host, entry);
    }
    if (!active) return;
    const anchors = [...document.querySelectorAll(thumbnailSelector)];
    let index = 0;
    function batch() {
      if (!settings.enabled || settings.openMode !== "button" || session || isWatch()) return;
      const end = Math.min(index + 25, anchors.length);
      for (; index < end; index++) {
        const anchor = anchors[index];
        const menu = findCardMenu(anchor);
        if (anchor.isConnected && YPO.videoLink(anchor.href) && menu?.parentElement && !anchor.contains(menu)) {
          addThumbnailButton(menu.parentElement, anchor, menu);
        }
      }
      if (index < anchors.length) requestAnimationFrame(batch);
    }
    batch();
  }
  const thumbnailObserver = new MutationObserver(scheduleThumbnails);
  thumbnailObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "hidden", "active"] });
  document.addEventListener("pointerover", event => {
    scheduleThumbnails();
  }, { passive: true });
  scheduleThumbnails();

  async function readSettings() {
    try { settings = YPO.normalize((await chrome.storage.local.get("settings")).settings); }
    catch (error) { console.warn("YouTube Player Overlay: settings unavailable", error); }
    emit("home-feed-option", settings.preserveHomeFeed);
    scheduleThumbnails();
  }
  void readSettings();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.settings) return;
    settings = YPO.normalize(changes.settings.newValue);
    emit("home-feed-option", settings.preserveHomeFeed);
    if (session && !settings.enabled && !session.closing) finish(); // Continue on the regular watch page.
    else schedule();
    scheduleThumbnails();
  });

  function button(text, title, action) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = text;
    element.title = title;
    element.setAttribute("aria-label", title);
    element.addEventListener("click", action);
    return element;
  }

  function readableText(node) {
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE || node.matches("script, style")) return "";
    const label = node.getAttribute("aria-label");
    if (label) return label;
    // Animated counters contain all ten digits; read their accessible label only.
    if (node.matches("yt-animated-rolling-number, [class*='animated-rolling-number'], [class*='AnimatedRollingNumber']")) return "";
    return [...node.childNodes].map(readableText).join(" ").replace(/\s+/g, " ").trim();
  }
  function renderMetadata() {
    const s = session;
    if (!s || !isWatch()) return;
    const id = new URL(location.href).searchParams.get("v");
    const data = s.metadata?.id === id ? s.metadata : {};
    // A live watch renderer belongs to this video only after YouTube updates its ID.
    const watch = document.querySelector(`ytd-watch-flexy[video-id="${id}"]`);
    const title = data.title || readableText(watch?.querySelector("ytd-watch-metadata h1, h1.title, #title h1"));
    const info = readableText(watch?.querySelector("#info-container, #description #info, #info-strings"));
    const agePattern = /\b(?:(?:Started streaming|Streamed|Premiered)\s+)?(?:\d{1,5}|an?|one)\s+(?:second|minute|hour|day|week|month|year)s?\s+ago\b/i;
    const age = agePattern.exec(data.relativeText ?? "")?.[0] || agePattern.exec(info)?.[0];
    const badge = watch?.querySelector("#extension-upload-date");
    // Reuse the badge's calendar date only, not its older day-only age fallback.
    const badgeDate = badge?.dataset.videoId === id ? badge.dataset.date : "";
    let date;
    if (data.live) {
      const streamAge = age || YPO.relativeAge(data.streamStart);
      date = streamAge ? /^Started streaming\b/i.test(streamAge) ? streamAge : `Started streaming ${streamAge}` : "";
    } else date = YPO.publicationDate(data.date || badgeDate, age);
    const nativeCount = readableText(watch?.querySelector("ytd-video-view-count-renderer .view-count, #view-count .view-count, .view-count"));
    const count = nativeCount || data.countText || (/^\d+$/.test(data.views ?? "") ? `${new Intl.NumberFormat("en-US").format(BigInt(data.views))} views` : "");
    for (const [node, value] of [[s.videoTitle, title], [s.videoDate, date], [s.videoCount, count]]) {
      if (node.textContent !== value) node.textContent = value;
      node.title = value;
    }
    s.videoInfo.hidden = !date && !count;
  }
  function refreshMetadata() {
    if (!session || !isWatch()) return;
    emit("metadata-request");
    renderMetadata();
  }
  document.addEventListener("ypo:metadata", event => {
    if (!session || typeof event.detail !== "string") return;
    try {
      const data = JSON.parse(event.detail);
      if (data.id !== new URL(location.href).searchParams.get("v")) return;
      session.metadata = data;
      renderMetadata();
    } catch { /* Ignore incomplete page data. */ }
  });

  function begin(link, invoker) {
    cancelRestore();
    miniplayerReturn = null;
    emit("allow-miniplayer");
    const manager = document.querySelector("ytd-page-manager");
    const background = manager && [...manager.children].find(child =>
      !child.hasAttribute("hidden") && child.getBoundingClientRect().height > 0);
    // A thumbnail on a watch page simply replaces the playing video normally.
    if (!background || isWatch() || location.pathname.startsWith("/shorts/")) return false;
    const rect = background.getBoundingClientRect();
    const shade = document.createElement("div");
    shade.id = "ypo-shade";
    shade.setAttribute("aria-hidden", "true");
    shade.addEventListener("click", close);
    const toolbar = document.createElement("div");
    toolbar.id = "ypo-toolbar";
    toolbar.setAttribute("role", "group");
    toolbar.setAttribute("aria-label", "Overlay controls");
    const videoTitle = document.createElement("h2");
    videoTitle.id = "ypo-video-title";
    const videoInfo = document.createElement("div");
    videoInfo.id = "ypo-video-info";
    const videoDate = document.createElement("span");
    const videoCount = document.createElement("span");
    videoInfo.append(videoCount, videoDate);
    videoInfo.hidden = true;
    const watchLink = document.createElement("a");
    watchLink.href = link.path;
    watchLink.textContent = "Go to watch page ↗";
    watchLink.title = "Continue on the watch page; middle-click to open a new tab";
    watchLink.addEventListener("click", event => {
      event.stopPropagation();
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      finish();
    });
    watchLink.addEventListener("auxclick", event => event.stopPropagation());
    const pipButton = button("Miniplayer ↘", "Continue in YouTube’s bottom-right miniplayer", openMiniplayer);
    pipButton.id = "ypo-miniplayer";
    pipButton.disabled = true;
    pipButton.hidden = true;
    toolbar.append(videoTitle, videoInfo, watchLink, pipButton, button("✕", "Close player (Escape)", close));
    const status = document.createElement("div");
    status.id = "ypo-status";
    status.setAttribute("role", "status");
    status.textContent = "Opening video…";
    // Share the page manager's stacking context with the player and preserved feed.
    manager.append(shade, toolbar, status);
    const sourceScroll = { x: scrollX, y: scrollY };
    // Fixing the entire feed otherwise collapses the document before YouTube saves
    // the source history entry, so YouTube records a scroll position of zero.
    const spacer = document.createElement("div");
    spacer.style.height = `${rect.height}px`;
    spacer.setAttribute("aria-hidden", "true");
    background.before(spacer);
    session = { source: currentPath(), scroll: sourceScroll, invoker, spacer, watchLink, pipButton, videoTitle, videoInfo, videoDate, videoCount,
      background, shade, toolbar, status, ratio: link.short ? 9 / 16 : 16 / 9,
      rect, inert: new Map(), path: new Set(), concealed: new Set(), player: null, watch: null, closing: false, backs: 0,
      initialHistoryLength: history.length, expectedId: link.id, ready: false };
    background.setAttribute("data-ypo-background", "");
    background.style.setProperty("--ypo-background-top", `${rect.top}px`);
    background.style.setProperty("--ypo-background-left", `${rect.left}px`);
    background.style.setProperty("--ypo-background-width", `${rect.width}px`);
    emit("feed-capture");
    root.setAttribute("data-ypo-open", "");
    session.observer = new MutationObserver(records => {
      if (records.some(record => record.type === "childList" || record.target.matches?.(".ytp-miniplayer-button"))) schedule();
    });
    session.observer.observe(manager, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "aria-disabled"] });
    session.metadataTimer = setInterval(refreshMetadata, 1000);
    session.timeout = setTimeout(() => {
      if (!session || session.ready || session.closing) return;
      // Never strand the user behind a loading overlay if YouTube changes its router/markup.
      const path = link.path;
      const navigated = isWatch();
      finish();
      if (!navigated) location.assign(path);
    }, 12000);
    schedule();
    toolbar.lastElementChild.focus({ preventScroll: true });
    return true;
  }

  function makeInert(element) {
    if (session.inert.has(element)) return;
    session.inert.set(element, element.inert);
    element.inert = true;
  }

  function schedule() {
    if (session && !frame) frame = requestAnimationFrame(update);
  }
  function update() {
    frame = 0;
    const s = session;
    if (!s || s.closing) return;
    s.shade.style.backgroundColor = `rgb(0 0 0 / ${settings.darkness / 100})`;
    const watch = document.querySelector("ytd-watch-flexy:not([hidden])");
    const player = watch?.querySelector("#movie_player");
    if (!isWatch() || !player) return;
    if (s.metadataId !== new URL(location.href).searchParams.get("v")) {
      s.metadataId = new URL(location.href).searchParams.get("v");
      s.metadata = null;
      refreshMetadata();
    } else renderMetadata();
    s.watchLink.href = currentPath();
    // YouTube may omit the visible miniplayer button while still supporting its
    // in-site miniplayer through the player API / normal return navigation.
    const nativeMini = player.querySelector(".ytp-miniplayer-button");
    const miniDisabled = Boolean(nativeMini && (nativeMini.disabled || nativeMini.getAttribute("aria-disabled") === "true"));
    s.pipButton.disabled = miniDisabled;
    s.pipButton.hidden = miniDisabled;
    s.pipButton.title = "Continue in YouTube’s bottom-right miniplayer";
    if (s.watch !== watch) {
      s.watch?.removeAttribute("data-ypo-watch");
      s.watch = watch;
      watch.setAttribute("data-ypo-watch", "");
      s.watchAttributes = new Map(["role", "aria-label", "aria-modal", "aria-owns"].map(key => [key, watch.getAttribute(key)]));
      watch.setAttribute("role", "dialog");
      watch.setAttribute("aria-label", "Video player overlay");
      watch.setAttribute("aria-modal", "true");
      watch.setAttribute("aria-owns", "ypo-toolbar");
    }
    if (s.player !== player) {
      for (const node of s.path) node.removeAttribute("data-ypo-player-path");
      for (const node of s.concealed) node.removeAttribute("data-ypo-concealed");
      s.path.clear(); s.concealed.clear();
      s.player?.removeAttribute("data-ypo-player");
      s.player = player;
      player.setAttribute("data-ypo-player", "");
      // Keep YouTube's original role and controls unchanged.
      s.ready = true;
      s.status.hidden = true;
      clearTimeout(s.timeout);
      player.focus({ preventScroll: true });
    }
    // Inert only sibling branches: never inert an ancestor of the native player.
    for (let node = player; node && node !== document.body; node = node.parentElement) {
      if (node !== player && watch.contains(node)) {
        node.setAttribute("data-ypo-player-path", "");
        s.path.add(node);
      }
      for (const sibling of node.parentElement?.children ?? []) {
        if (sibling !== node && ![s.shade, s.toolbar, s.status].includes(sibling) &&
            !["SCRIPT", "STYLE", "LINK"].includes(sibling.tagName)) {
          makeInert(sibling);
          // Hide only other watch-page branches. Never hide a video ancestor:
          // visibility/paint containment on it can suppress the video compositor.
          if (watch.contains(sibling)) {
            sibling.setAttribute("data-ypo-concealed", "");
            s.concealed.add(sibling);
          }
        }
      }
    }
    if (document.fullscreenElement) {
      if (!s.resized) { s.resized = true; emit("resize"); }
      return;
    }
    const size = YPO.dimensions(innerWidth, innerHeight - 112, settings.size, s.ratio);
    const previous = player.style.getPropertyValue("--ypo-width");
    player.style.setProperty("--ypo-width", `${size.width}px`);
    player.style.setProperty("--ypo-height", `${size.height}px`);
    s.toolbar.style.width = `${size.width}px`;
    const toolbarTop = Math.max(8, innerHeight / 2 - size.height / 2 - 44);
    s.toolbar.style.top = `${toolbarTop}px`;
    // Keep the miniplayer action at the player's lower-right edge without
    // covering YouTube's seek bar, volume, captions, or fullscreen controls.
    const miniplayerTop = Math.min(innerHeight - 36, innerHeight / 2 + size.height / 2 + 8);
    s.pipButton.style.top = `${miniplayerTop - toolbarTop}px`;
    s.videoInfo.style.top = `${miniplayerTop - toolbarTop + (size.width < 440 && !s.pipButton.hidden ? 36 : 0)}px`;
    s.videoInfo.style.maxWidth = `${size.width < 440 || s.pipButton.hidden ? size.width : size.width - 180}px`;
    if (previous !== `${size.width}px` || !s.resized) {
      s.resized = true;
      emit("resize");
    }
  }

  function finish(restore = false) {
    const s = session;
    if (!s) return;
    if (restore) { emit("stop"); emit("feed-restore"); }
    else if (miniplayerReturn !== s) emit("feed-release");
    session = null;
    clearTimeout(s.timeout);
    clearTimeout(s.closeTimeout);
    clearTimeout(s.returnTimeout);
    clearInterval(s.metadataTimer);
    s.observer.disconnect();
    s.returnObserver?.disconnect();
    cancelAnimationFrame(frame);
    frame = 0;
    root.removeAttribute("data-ypo-open");
    root.removeAttribute("data-ypo-fullscreen");
    root.removeAttribute("data-ypo-closing");
    s.background.removeAttribute("data-ypo-background");
    s.spacer.remove();
    for (const key of ["top", "left", "width"]) s.background.style.removeProperty(`--ypo-background-${key}`);
    s.watch?.removeAttribute("data-ypo-watch");
    for (const [key, value] of s.watchAttributes ?? []) {
      if (value === null) s.watch.removeAttribute(key);
      else s.watch.setAttribute(key, value);
    }
    s.player?.removeAttribute("data-ypo-player");
    s.player?.style.removeProperty("--ypo-width");
    s.player?.style.removeProperty("--ypo-height");
    for (const node of s.path) node.removeAttribute("data-ypo-player-path");
    for (const node of s.concealed) node.removeAttribute("data-ypo-concealed");
    for (const [element, inert] of s.inert) element.inert = inert;
    s.shade.remove(); s.toolbar.remove(); s.status.remove();
    scheduleThumbnails();
    window.dispatchEvent(new Event("resize"));
    if (restore) restoreScroll(s);
    // A click on another overlay action during the return belongs to the source
    // page, so open it only after that page's route and scroll are restored.
    if (restore && s.nextOverlay && settings.enabled) {
      const { link, invoker } = s.nextOverlay;
      if (begin(link, invoker)) emit("navigate", link.path);
    }
  }

  function dismissOverlay(s) {
    s.closing = true;
    s.closingId = new URL(location.href).searchParams.get("v");
    clearTimeout(s.timeout);
    clearInterval(s.metadataTimer);
    s.observer.disconnect();
    cancelAnimationFrame(frame);
    frame = 0;
    emit("stop");
    emit("feed-prepare-return");
    root.removeAttribute("data-ypo-fullscreen");
    root.setAttribute("data-ypo-closing", "");
    s.shade.remove(); s.toolbar.remove(); s.status.remove();
    // Release the feed immediately while keeping its original viewport pinned
    // until YouTube finishes the asynchronous return navigation.
    for (const [element, inert] of s.inert) element.inert = inert;
    if (s.watch) {
      if (!s.inert.has(s.watch)) s.inert.set(s.watch, s.watch.inert);
      s.watch.inert = true;
    }
    if (s.invoker.isConnected) s.invoker.focus({ preventScroll: true });
    s.returnObserver = new MutationObserver(() => {
      if (session === s && sourceReady(s)) finish(true);
    });
    s.returnObserver.observe(s.background.parentElement ?? document.querySelector("ytd-page-manager"),
      { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  }

  function sourceReady(s) {
    return currentPath() === s.source && Boolean(document.querySelector(
      `ytd-page-manager > ${s.background.localName}:not([hidden])`));
  }

  function openMiniplayer() {
    const s = session;
    const nativeButton = s?.player?.querySelector(".ytp-miniplayer-button");
    if (!s || !s.player) return;
    emit("allow-miniplayer");
    miniplayerReturn = s;
    const historyCount = Math.max(1, history.length - s.initialHistoryLength);
    let returning = false;
    // Restore the native layout and release inert controls before invoking YouTube.
    finish();
    if (nativeButton && !nativeButton.disabled && nativeButton.getAttribute("aria-disabled") !== "true") {
      nativeButton.click();
    } else {
      // This is the same return navigation which can automatically create the
      // native miniplayer, deliberately keeping playback alive only for this action.
      emit("minimize");
      if (currentPath() !== s.source) { returning = true; history.go(-historyCount); }
    }
    setTimeout(() => {
      if (miniplayerReturn !== s) return;
      const active = document.querySelector("ytd-miniplayer[active], .ytp-player-minimized");
      if (!returning && isWatch() && active) history.go(-historyCount);
      // The native button normally performs navigation itself. Never use browser PiP.
    }, 250);
    setTimeout(() => { if (miniplayerReturn === s) miniplayerReturn = null; }, 4000);
  }

  function restoreScroll(s) {
    cancelRestore();
    const controller = new AbortController();
    const started = performance.now();
    let restoreFrame;
    const stop = () => { controller.abort(); cancelAnimationFrame(restoreFrame); };
    cancelRestore = stop;
    for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) {
      window.addEventListener(event, stop, { capture: true, passive: true, signal: controller.signal });
    }
    let first = true;
    function restore() {
      if (controller.signal.aborted || currentPath() !== s.source) { stop(); return; }
      if (first || Math.abs(scrollY - s.scroll.y) > 1 || Math.abs(scrollX - s.scroll.x) > 1) {
        scrollTo({ left: s.scroll.x, top: s.scroll.y, behavior: "instant" });
      }
      if (first && s.invoker.isConnected) s.invoker.focus({ preventScroll: true });
      first = false;
      // YouTube can reset scroll after navigate-finish as cached content lays out.
      if (performance.now() - started < 1200) restoreFrame = requestAnimationFrame(restore);
      else stop();
    }
    restore();
  }

  function close() {
    if (!session || session.closing) return;
    if (document.fullscreenElement) { void document.exitFullscreen(); return; }
    if (currentPath() === session.source) { finish(true); return; }
    const s = session;
    dismissOverlay(s);
    // One ordinary click creates one history entry. Autoplay may add more.
    const count = Math.max(1, history.length - s.initialHistoryLength);
    s.closeTimeout = setTimeout(() => {
      if (session !== s) return;
      if (currentPath() === s.source) { finish(true); return; }
      // Do not reload the feed as a fallback: that loses its loaded items and scroll.
      finish();
    }, 4000);
    history.go(-count);
  }

  window.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest(".ypo-thumbnail-button");
    if (control) {
      event.preventDefault(); event.stopImmediatePropagation();
      if ((session && !session.closing) || !settings.enabled || event.button !== 0) return;
      const entry = thumbnailButtons.get(control.parentElement);
      const link = entry && YPO.videoLink(entry.anchor.href);
      if (link && session?.closing) { session.nextOverlay = { link, invoker: control }; return; }
      if (link && begin(link, control)) emit("navigate", link.path);
      return;
    }
    if ((session && !session.closing) || !settings.enabled || event.defaultPrevented || event.button !== 0 ||
        settings.openMode !== "thumbnail" ||
        event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const anchor = target?.closest("a[href]");
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    // Thumbnail clicks only: leave titles, sidebar links, menus and channel links alone.
    if (!anchor.matches("a#thumbnail, a.yt-lockup-view-model__content-image, a.reel-item-endpoint, a.shortsLockupViewModelHostEndpoint") &&
        !anchor.querySelector("img, yt-image")) return;
    const link = YPO.videoLink(anchor.href);
    if (link && session?.closing) {
      event.preventDefault(); event.stopImmediatePropagation();
      session.nextOverlay = { link, invoker: anchor };
      return;
    }
    if (!link || !begin(link, anchor)) return;
    // Let regular thumbnails use their own native endpoint (timestamps and playlists included).
    if (link.short) {
      event.preventDefault(); event.stopImmediatePropagation();
      emit("navigate", link.path);
    }
  }, true);

  document.addEventListener("yt-navigate-finish", () => {
    scheduleThumbnails();
    if (miniplayerReturn && currentPath() === miniplayerReturn.source) {
      const s = miniplayerReturn;
      miniplayerReturn = null;
      restoreScroll(s);
    }
    if (!session) return;
    if (currentPath() === session.source) { finish(true); return; }
    if (!isWatch()) { finish(); return; }
    if (session.closing) {
      // Ignore a late finish for the video being closed; an intentional new
      // watch destination should still take over normally.
      if (new URL(location.href).searchParams.get("v") !== session.closingId) finish();
      return;
    }
    schedule();
  });
  window.addEventListener("popstate", () => {
    // YouTube restores cached pages asynchronously; wait for navigate-finish before
    // restoring scroll, rather than scrolling while the source page is still hidden.
    if (session && !isWatch()) {
      const s = session;
      if (!s.closing) dismissOverlay(s);
      clearTimeout(s.returnTimeout);
      s.returnTimeout = setTimeout(() => {
        if (session !== s || isWatch()) return;
        if (sourceReady(s)) finish(true);
        else if (currentPath() !== s.source) finish();
      }, 1500);
    }
  });
  window.addEventListener("resize", schedule);
  document.addEventListener("fullscreenchange", () => {
    const full = document.fullscreenElement;
    const player = session?.player;
    root.toggleAttribute("data-ypo-fullscreen", Boolean(!session?.closing && full && player && (full.contains(player) || player.contains(full))));
    if (session) session.resized = false;
    schedule();
  });
  document.addEventListener("keydown", event => {
    if (!session || session.closing || document.fullscreenElement) return;
    if (event.key === "Escape") {
      // Allow YouTube to dismiss its settings menu before closing the entire overlay.
      const menu = session.player?.querySelector(".ytp-settings-menu");
      if (menu && getComputedStyle(menu).display !== "none") return;
      event.preventDefault(); event.stopImmediatePropagation(); close();
    } else if (event.key === "Tab") {
      const candidates = [...(session.player?.querySelectorAll("button, a[href], input, [tabindex]") ?? []),
        ...session.toolbar.querySelectorAll("button, a[href]")].filter(element =>
        !element.disabled && element.tabIndex >= 0 && element.getBoundingClientRect().width > 0 &&
        getComputedStyle(element).visibility !== "hidden");
      if (!candidates.length) return;
      const index = candidates.indexOf(document.activeElement);
      if (index === -1 || (!event.shiftKey && index === candidates.length - 1) || (event.shiftKey && index === 0)) {
        event.preventDefault();
        candidates[event.shiftKey ? candidates.length - 1 : 0].focus();
      }
    }
  }, true);
  window.addEventListener("pagehide", () => finish());
})();
