/* Tiny page-world bridge. No access to Chrome APIs, storage, or arbitrary code execution. */
(() => {
  "use strict";
  let suppressMini = false;
  let suppressedId = null;
  let feedSnapshot = null;
  let feedRestore = null;
  let preserveHomeFeed = false;
  const feedRenderers = "ytd-rich-grid-renderer, ytd-section-list-renderer, ytd-grid-renderer, ytd-item-section-renderer";
  function releaseFeed() {
    if (feedRestore) {
      feedRestore.controller.abort();
      clearInterval(feedRestore.timer);
      cancelAnimationFrame(feedRestore.frame);
      feedRestore.observer.disconnect();
    }
    feedRestore = null;
    feedSnapshot = null;
  }
  function copyFeedData(data) {
    if (!data || typeof data !== "object") return null;
    try { return structuredClone(data); }
    catch {
      try { return JSON.parse(JSON.stringify(data)); }
      catch { return data; }
    }
  }
  // Renderer data are JSON-like objects. Compare values, not clone identities,
  // so returning to an intact feed never invokes its native rendering setters.
  function sameFeedData(actual, saved, seen = new WeakMap()) {
    if (Object.is(actual, saved)) return true;
    if (!actual || !saved || typeof actual !== "object" || typeof saved !== "object" ||
        Array.isArray(actual) !== Array.isArray(saved)) return false;
    if (seen.get(actual)?.has(saved)) return true;
    if (!seen.has(actual)) seen.set(actual, new WeakSet());
    seen.get(actual).add(saved);
    const keys = Object.keys(actual);
    return keys.length === Object.keys(saved).length && keys.every(key =>
      Object.hasOwn(saved, key) && sameFeedData(actual[key], saved[key], seen));
  }
  function captureFeed(source) {
    if (!source) return null;
    const nodes = [source, ...source.querySelectorAll(feedRenderers)];
    const entries = nodes.map((node, index) => ({ node, index, tag: node.localName, data: copyFeedData(node.data) })).filter(entry => entry.data);
    if (!entries.length) return null;
    // One source page only, held in memory until the overlay round trip ends.
    return { source, tag: source.localName, path: location.pathname + location.search, entries };
  }
  document.addEventListener("ypo:feed-capture", () => {
    releaseFeed();
    feedSnapshot = captureFeed(document.querySelector("[data-ypo-background]"));
  });
  document.addEventListener("ypo:home-feed-option", event => {
    preserveHomeFeed = event.detail === true;
    if (!preserveHomeFeed && feedSnapshot?.home) releaseFeed();
  });
  function homeEntryKey(create = false) {
    if (window.navigation?.currentEntry?.key) return window.navigation.currentEntry.key;
    // Fallback for contexts without Navigation API: preserve all native state.
    if (create && !history.state?.ypoHomeEntry) {
      if (history.state !== null && (typeof history.state !== "object" || Array.isArray(history.state))) return null;
      history.replaceState({ ...history.state, ypoHomeEntry: crypto.randomUUID() }, "");
    }
    return history.state?.ypoHomeEntry ?? null;
  }
  function captureHome() {
    if (!preserveHomeFeed || location.pathname !== "/" ||
        document.documentElement.hasAttribute("data-ypo-open")) return;
    const key = homeEntryKey(true);
    if (!key) return;
    releaseFeed();
    const saved = captureFeed(document.querySelector("ytd-page-manager > ytd-browse:not([hidden])"));
    if (saved) feedSnapshot = { ...saved, home: true, key, lastIndex: window.navigation?.currentEntry?.index,
      scroll: { x: scrollX, y: scrollY }, watched: false, returning: false };
  }
  document.addEventListener("click", event => {
    if (!preserveHomeFeed || event.defaultPrevented || event.button !== 0 ||
        event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const anchor = event.target instanceof Element && event.target.closest("a[href]");
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    let url;
    try { url = new URL(anchor.href); } catch { return; }
    if (url.origin !== location.origin) return;
    if (feedSnapshot?.home && feedSnapshot.watched) { releaseFeed(); return; }
    if (url.pathname === "/") { if (feedSnapshot?.home) releaseFeed(); return; }
    if ((url.pathname === "/watch" || url.pathname.startsWith("/shorts/")) && location.pathname === "/") captureHome();
  }, true);
  window.addEventListener("popstate", () => {
    const saved = feedSnapshot;
    if (!saved?.home) return;
    const index = window.navigation?.currentEntry?.index;
    const backward = Number.isInteger(index) && Number.isInteger(saved.lastIndex) ? index < saved.lastIndex : true;
    if (saved.watched && backward && location.pathname + location.search === saved.path && homeEntryKey() === saved.key) {
      saved.returning = true;
      restoreFeed();
    } else releaseFeed();
    if (feedSnapshot === saved) saved.lastIndex = index;
  });
  document.addEventListener("yt-navigate-finish", () => {
    const saved = feedSnapshot;
    if (!saved?.home) return;
    if (location.pathname === "/watch" || location.pathname.startsWith("/shorts/")) {
      const path = location.pathname + location.search;
      const key = homeEntryKey();
      if (saved.watched && (saved.watchPath !== path || saved.watchKey !== key)) { releaseFeed(); return; }
      saved.watched = true;
      saved.watchPath = path;
      saved.watchKey = key;
      saved.lastIndex = window.navigation?.currentEntry?.index;
    }
    else if (!saved.returning || location.pathname + location.search !== saved.path) releaseFeed();
  });
  // Only a backward traversal straight Home can keep an armed backup.
  window.navigation?.addEventListener?.("navigate", event => {
    const saved = feedSnapshot;
    if (!saved?.home || !saved.watched) return;
    const directBack = event.navigationType === "traverse" && event.destination?.key === saved.key &&
      event.destination.index < window.navigation.currentEntry.index;
    if (!directBack) releaseFeed();
  });
  function applyFeed(saved, checkContents, originalOnly = false) {
    const source = (originalOnly ? saved.source : document.querySelector(`ytd-page-manager > ${saved.tag}:not([hidden])`)) ?? saved.source;
    if (!source.isConnected) return;
    let nodes;
    for (const entry of saved.entries) {
      const node = source.contains(entry.node) ? entry.node :
        (nodes ??= [source, ...source.querySelectorAll(feedRenderers)])[entry.index];
      if (node?.localName !== entry.tag) continue;
      try {
        const data = node.data;
        // After the initial content check, only inspect replacement objects.
        // This keeps the late-navigation guard cheap even on a long feed.
        if (!checkContents && entry.checkedNode === node && entry.checkedData === data) continue;
        if (!sameFeedData(data, entry.data)) {
          // Keep the backup immutable if YouTube later mutates the restored data.
          node.data = copyFeedData(entry.data);
          nodes = null; // A parent setter may have replaced descendant renderers.
        }
        entry.checkedNode = node;
        entry.checkedData = node.data;
      } catch { /* Some renderer variants expose read-only data. */ }
    }
  }
  // Check the pinned feed before removing the shade, including changes made
  // during playback, without navigating or constructing a replacement feed.
  document.addEventListener("ypo:feed-prepare-return", () => {
    if (feedSnapshot) applyFeed(feedSnapshot, true, true);
  });
  function restoreFeed() {
    const saved = feedSnapshot;
    if (!saved || (saved.home && !saved.returning) || location.pathname + location.search !== saved.path) return;
    applyFeed(saved, !feedRestore);
    function restoreHomeScroll() {
      if (!saved.home) return;
      const source = document.querySelector(`ytd-page-manager > ${saved.tag}:not([hidden])`);
      if (source && (scrollX !== saved.scroll.x || scrollY !== saved.scroll.y)) {
        scrollTo({ left: saved.scroll.x, top: saved.scroll.y, behavior: "instant" });
      }
    }
    restoreHomeScroll();
    if (feedRestore) return;
    const controller = new AbortController();
    const started = performance.now();
    const observer = new MutationObserver(() => {
      if (!feedRestore || feedRestore.frame) return;
      feedRestore.frame = requestAnimationFrame(() => {
        if (!feedRestore) return;
        feedRestore.frame = 0;
        if (location.pathname + location.search === saved.path) applyFeed(saved, false);
        if (location.pathname + location.search === saved.path) restoreHomeScroll();
      });
    });
    observer.observe(document.querySelector("ytd-page-manager") ?? saved.source, { childList: true, subtree: true, characterData: true });
    feedRestore = { controller, timer: 0, frame: 0, observer };
    for (const event of ["pointerdown", "wheel", "touchstart", "keydown"]) {
      window.addEventListener(event, releaseFeed, { capture: true, passive: true, signal: controller.signal });
    }
    feedRestore.timer = setInterval(() => {
      if (feedSnapshot !== saved || location.pathname + location.search !== saved.path || performance.now() - started > 5000) { releaseFeed(); return; }
      applyFeed(saved, false);
      restoreHomeScroll();
    }, 100);
  }
  document.addEventListener("ypo:feed-restore", restoreFeed);
  document.addEventListener("ypo:feed-release", releaseFeed);
  document.addEventListener("yt-navigate-finish", restoreFeed);
  window.addEventListener("pagehide", releaseFeed);
  const dismissed = new WeakSet();
  function allowMini() {
    suppressMini = false;
    suppressedId = null;
    for (const mini of document.querySelectorAll("[data-ypo-dismissed]")) mini.removeAttribute("data-ypo-dismissed");
  }
  function dismissMini() {
    if (!suppressMini) return;
    const mini = document.querySelector("ytd-miniplayer");
    if (!mini) return;
    const player = mini.querySelector("#movie_player");
    try {
      const id = player?.getVideoData?.()?.video_id ?? player?.getPlayerResponse?.()?.videoDetails?.videoId;
      if (id && suppressedId && id !== suppressedId) { allowMini(); return; }
    } catch { /* Keep guarding the video we explicitly closed. */ }
    if (!mini.hasAttribute("active") && !mini.querySelector(".ytp-player-minimized")) { dismissed.delete(mini); return; }
    if (dismissed.has(mini)) return;
    dismissed.add(mini);
    mini.setAttribute("data-ypo-dismissed", "");
    mini.querySelector(".ytp-miniplayer-close-button")?.click();
    try { player?.stopVideo?.(); } catch { /* The native close control remains the primary path. */ }
  }
  document.addEventListener("ypo:allow-miniplayer", allowMini);
  document.addEventListener("ypo:minimize", () => {
    allowMini();
    const player = document.querySelector("ytd-watch-flexy #movie_player") ?? document.querySelector("#movie_player");
    // Optional internal method: YouTube can support minimization without exposing
    // its old toolbar button. Navigation remains the fallback if absent/unsupported.
    try { if (typeof player?.minimize === "function") player.minimize(); }
    catch { /* Allow YouTube's ordinary navigation-driven miniplayer behavior. */ }
  });
  // Only deliberately opening/playing another video resets suppression. An
  // unrelated click or a slow navigation must not resurrect the closed video.
  document.addEventListener("click", event => {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    const anchor = event.target.closest("a[href]");
    if (anchor) {
      try {
        const url = new URL(anchor.href);
        if (url.origin === location.origin && (url.pathname === "/watch" || url.pathname.startsWith("/shorts/"))) allowMini();
      } catch { /* Not a video link. */ }
    }
    if (location.pathname === "/watch" && !document.documentElement.hasAttribute("data-ypo-open") && event.target.closest("#movie_player")) allowMini();
  }, true);
  document.addEventListener("ypo:stop", () => {
    suppressMini = true;
    suppressedId = new URL(location.href).searchParams.get("v") ?? suppressedId;
    const player = document.querySelector("#movie_player[data-ypo-player]") ?? document.querySelector("ytd-miniplayer #movie_player");
    try { player?.pauseVideo?.(); player?.stopVideo?.(); } catch { /* Close any native miniplayer after navigation too. */ }
    dismissMini();
  });
  const miniObserver = new MutationObserver(records => {
    for (const record of records) if (record.attributeName === "active") dismissed.delete(record.target);
    dismissMini();
  });
  miniObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["active", "class"] });
  document.addEventListener("yt-navigate-finish", dismissMini);
  document.addEventListener("ypo:metadata-request", () => {
    const id = new URL(location.href).searchParams.get("v");
    if (location.pathname !== "/watch" || !id) return;
    try {
      const player = document.querySelector("#movie_player");
      const response = [player?.getPlayerResponse?.(), window.ytInitialPlayerResponse]
        .find(value => value?.videoDetails?.videoId === id);
      if (!response) return;
      const details = response.videoDetails;
      const format = response.microformat?.playerMicroformatRenderer;
      const live = Boolean(details.isLive || (format?.liveBroadcastDetails?.startTimestamp && !format.liveBroadcastDetails.endTimestamp));
      // Restrict page data to the current watch video, never stale SPA data.
      const watch = document.querySelector("ytd-watch-flexy:not([hidden])");
      const page = watch?.getAttribute("video-id") === id ? watch.data :
        window.ytInitialData?.currentVideoEndpoint?.watchEndpoint?.videoId === id ? window.ytInitialData : null;
      const items = page?.contents?.twoColumnWatchNextResults?.results?.results?.contents ?? [];
      const primary = items.find(item => item.videoPrimaryInfoRenderer)?.videoPrimaryInfoRenderer;
      const count = primary?.viewCount?.videoViewCountRenderer?.viewCount;
      const countText = count?.simpleText ?? count?.runs?.map(run => run.text).join("") ?? "";
      const relative = primary?.relativeDateText ?? primary?.dateText;
      const relativeText = relative?.simpleText ?? relative?.runs?.map(run => run.text).join("") ?? "";
      document.dispatchEvent(new CustomEvent("ypo:metadata", { detail: JSON.stringify({
        id, title: details.title, live, countText, relativeText,
        streamStart: format?.liveBroadcastDetails?.startTimestamp ?? "",
        views: live ? "" : details.viewCount,
        date: details.isLiveContent && !format?.liveBroadcastDetails?.endTimestamp ? "" : format?.publishDate || format?.uploadDate || ""
      }) }));
    } catch { /* Retry while the current player's data initializes. */ }
  });
  document.addEventListener("ypo:navigate", (event) => {
    // The only supported destination is a same-origin regular watch page.
    if (typeof event.detail !== "string") return;
    let url;
    try { url = new URL(event.detail, location.origin); } catch { return; }
    if (url.origin !== location.origin || url.pathname !== "/watch" ||
        !/^[\w-]{11}$/.test(url.searchParams.get("v") ?? "")) return;
    const app = document.querySelector("ytd-app");
    if (!app) return;
    const watchEndpoint = { videoId: url.searchParams.get("v") };
    if (url.searchParams.has("list")) watchEndpoint.playlistId = url.searchParams.get("list");
    const timestamp = url.searchParams.get("t") ?? url.searchParams.get("start");
    if (timestamp) {
      const match = /^(?:(\d+)h)?(?:(\d+)m)?(\d+)?s?$/.exec(timestamp);
      if (match) watchEndpoint.startTimeSeconds = Number(match[1] ?? 0) * 3600 +
        Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
    }
    app.dispatchEvent(new CustomEvent("yt-navigate", {
      bubbles: true, composed: true,
      detail: { endpoint: { commandMetadata: { webCommandMetadata: {
        url: url.pathname + url.search, webPageType: "WEB_PAGE_TYPE_WATCH", rootVe: 3832
      } }, watchEndpoint } }
    }));
  });
  document.addEventListener("ypo:resize", () => {
    const player = document.querySelector("#movie_player[data-ypo-player]");
    if (!player) return;
    const rect = player.getBoundingClientRect();
    try { player.setSize?.(Math.round(rect.width), Math.round(rect.height)); } catch { /* CSS still sizes the player. */ }
    window.dispatchEvent(new Event("resize"));
  });
  document.addEventListener("ypo:pause", () => {
    try { document.querySelector("#movie_player[data-ypo-player]")?.pauseVideo?.(); } catch { /* Navigation also stops playback. */ }
  });
})();
