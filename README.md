# YouTube Player Overlay

Source repository: [hgurb/YouTube-Player-Overlay](https://github.com/hgurb/YouTube-Player-Overlay). Download the installable ZIP from [Releases](https://github.com/hgurb/YouTube-Player-Overlay/releases).

Build the runtime-only ZIP with `python scripts/package.py`. Release notes and installation instructions are in [RELEASE_NOTES.md](RELEASE_NOTES.md).

An experimental Manifest V3 Chrome extension. Use the overlay button beside a video or Short's three-dot menu on desktop YouTube to show the regular watch player above your browsing page. Shorts use the regular player, without the Shorts feed.

## Load in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select `D:\Chrome-extensions\YouTube-Player-Overlay`.
4. Refresh any open YouTube tabs.
5. Click **Open in overlay** beside the video's or Short's three-dot menu on Home, search results, subscriptions, or a channel's videos tab. Its 40 px expand icon stays visible in the metadata row below the thumbnail, including while its thumbnail preview plays.

**Open overlay using** offers two modes in the settings page:

- **Overlay button (default):** use the action beside the three-dot menu. Clicking the thumbnail itself keeps YouTube's normal navigation.
- **Click thumbnail:** clicking the thumbnail opens the overlay directly; the extra button is removed.

Existing installations without a saved mode also use the new button default. Switching modes updates open YouTube pages immediately.

Click the extension's toolbar icon to adjust player size (25–95% of the available window) and background darkness (0–100%). Settings save locally and update an open overlay. The preview illustrates both settings. Size fits within both viewport dimensions while preserving the aspect ratio; it is not a percentage of the original thumbnail.

Click the extension icon for a compact popup with only player size, background darkness, and a collapsible appearance preview. It automatically follows the full settings page's theme and saves changes immediately without changing the enable switch or opening mode. Right-click the extension icon and choose **Options** for the full settings page. Its top-right sun/moon button follows your system theme until you choose light or dark mode, then remembers your choice. The settings layout follows SEARCHIT, with this extension's charcoal/red palette and a bottom-right GitHub creator credit.

Press **Escape**, click the dimmed area, or click **✕** to stop playback and return. Ordinary closing also dismisses any automatic YouTube miniplayer created by that navigation. **Go to watch page** removes the overlay and continues playback normally. Ctrl/Cmd-click, Shift-click, middle-click, right-click, title links, and direct watch URLs retain normal behavior. Clicking recommendations while already on a watch page uses normal navigation.

**Go to watch page** is a regular link: middle-click or Ctrl/Cmd-click opens the current video in a new tab while leaving the overlay open. Closing removes the video and dimming immediately, keeping the existing feed visible while YouTube finishes returning to it. Clicking another overlay action during that return opens the requested video once the source route is ready. Closing preserves the feed's document height and restores its saved scroll position even if YouTube applies a delayed scroll reset; intentional scrolling cancels that correction. The close fallback does not refresh the source page.

The current video title appears at the top left. Publication date and view count appear at the bottom left. Dates match youtube-date-next-to-sub: `YYYY-MM-DD, weekday (relative age)`, preserving YouTube's calendar day. The extension reuses that extension's badge when available or formats the current player's publication date itself. Live videos show the current watching count when available and do not show a planned broadcast date as an upload date. Missing fields remain blank. Metadata refreshes every second while the overlay is open, without additional network requests. Full title/date/count text is available on hover when truncated to fit smaller players.

**Miniplayer ↘** requests YouTube's own in-site bottom-right miniplayer and returns to browsing while preserving playback. It uses the native toolbar control where present; otherwise it tries the player's optional minimization method and returns to the source page without stopping playback, allowing YouTube's navigation-driven miniplayer behavior. It does not use the browser's separate picture-in-picture window. Missing toolbar controls no longer disable our button. Actual availability and behavior still depend on YouTube's player. Thumbnail controls are reattached if YouTube replaces their card contents during this transition.

Clicking outside the player and its surrounding controls/text, pressing Escape, or clicking Close stops playback and returns to browsing. Clicking the title, date/count, or player does not dismiss the overlay. Miniplayer handoff is only requested by **Miniplayer ↘**. Automatic miniplayer reactivation for a closed overlay stays suppressed beyond navigation delays until another video is deliberately opened or playback is deliberately resumed. **Go to watch page** continues normal full-page playback instead of requesting a miniplayer.

## Architecture and limitations

**Keep Home feed when going Back** is an optional settings-page switch, off by default. It saves one Home feed (including loaded continuation items and scroll position) when you open a video normally. Only direct browser Back from the first video to that same Home history entry restores it. Navigating onward to another video or page releases the backup, so going Back twice does not restore it; the browser button, mouse Back and browser-back gestures use the same path. Forward, logo links, bookmarks, typed URLs and ordinary navigation retain YouTube's normal behavior. The option works independently of the overlay enable switch. Each tab holds its own temporary backup in page memory; the setting itself is shared across tabs. No feed data are written to storage or fetched by the extension. Turning the option off, leaving the relevant route, closing/reloading the tab or interacting after restoration releases the backup. Preservation relies on writable YouTube renderer data and needs live-site verification.

- No embed iframe, video downloading, API key, background service worker, or external dependencies at runtime.
- YouTube performs regular SPA watch navigation. The address changes to `/watch`; the existing browse/search element is kept visible behind a backdrop while the native player stays in its original DOM location. Closing navigates back and restores scroll position.
- Shorts thumbnail clicks request a regular watch endpoint through YouTube's internal `yt-navigate` event. This internal interface and YouTube's DOM may change. A 12-second startup timeout falls back to a normal watch page instead of leaving a stuck overlay.
- Existing player extensions have better compatibility prospects because the original player and controls are retained. Compatibility with specific extensions still needs live testing. This extension never forces another extension to run.
- Player ancestors remain visible with their clipping/paint containment removed during the overlay; only unrelated watch-page branches are hidden. The native video container fills the overlay to avoid an empty/clipped video surface. All temporary markers are removed on close.
- Source pages normally stay cached by YouTube. If YouTube removes or rebuilds a feed, exact feed preservation cannot be guaranteed. Browser history changes, autoplay, theater/miniplayer modes, fullscreen behavior, and other extensions need real-site verification.
- Portrait layout is selected for Shorts links; ordinary watch links use 16:9, with video content fitted inside it.
- Disabling the extension while an overlay is open continues on the normal watch page.
- Restricted/unavailable videos keep YouTube's normal playback restrictions and error UI.

## Checks

Run `npm ci` to install development dependencies, then `npm test` for URL handling, settings validation, sizing, manifest integrity, and simulated overlay navigation/cleanup. Run `npm run check` for JavaScript syntax validation. These checks do not establish compatibility with the live YouTube site.

## Live acceptance checklist

- Home/search/channel/subscription thumbnail opens the native player over the original feed; closing restores the same scroll position.
- Shorts thumbnail opens `/watch?v=…` as a portrait overlay, with no Shorts feed.
- Native controls appear/hide normally, seek and volume work, captions/settings menus open, ads and error states remain visible.
- Fullscreen enters/exits; Escape exits fullscreen first and then closes the overlay.
- Clicking the extension icon opens the minimal appearance popup; size/darkness update live and remain saved after restarting Chrome. Options opens the full settings page.
- Go to watch page continues playback; browser Back closes cleanly; rapid open/close and failed loads recover.
- Picture in picture hands off to YouTube's miniplayer; ordinary closing stops playback and dismisses automatic miniplayer transitions. The thumbnail button remains present after either transition.
- Ctrl/Cmd/Shift/middle-click and right-click retain native behavior.
- Check volume scrolling, CC-size scrolling, and extra buttons with your existing extensions enabled.

Version 0.1.0 is a prototype. Automated checks are available; live playback and third-party extension compatibility must be verified in Chrome before treating it as release-ready.

Picture in picture is hidden while loading or when YouTube explicitly disables its native control, and reappears when it becomes actionable. Cards without a recognized three-dot menu wait for YouTube to render that menu before adding the overlay action.

Publication ages match the current youtube-date-next-to-sub format: complete calendar years and remaining months (for example, `2 years and 3 months ago`), or complete calendar months and remaining days (`1 month and 5 days ago`). Month ends are clamped to the last valid day. For videos under a month old, YouTube's short relative wording is preferred with the same elapsed-time/date-only fallback as that extension. Active streams continue to show `Started streaming … ago` from YouTube's label or their actual start timestamp, alongside the current watching count.

Fullscreen expands the player to the viewport even when YouTube requests fullscreen on the page instead of the player element. The feed and extension toolbar are hidden until fullscreen exits, then the configured overlay size is restored.

The overlay also keeps a temporary snapshot of the source YouTube renderers' feed data, including loaded continuation items. Before revealing the feed and on return, it compares the saved contents with the current data. Intact feeds and equivalent replacement data are left alone, avoiding unnecessary card rebuilding. Changed data are restored through YouTube's native bindings to retain the original recommendations and order. A short return-settling guard checks replacement data references rather than comparing the entire feed every animation frame, and stops as soon as you interact with the feed again. The snapshot is released on completion, normal watch-page continuation, abandoned returns, or leaving the page. This relies on YouTube's internal renderer data, so layouts that do not expose writable data remain dependent on YouTube's own cache.
