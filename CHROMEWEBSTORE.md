# Chrome Web Store Listing — YouTube Player Overlay

Last Updated: 2026-11-23

## Store Listing

**Extension Name:** YouTube Player Overlay

**Short Description:** Open YouTube thumbnails in an adjustable overlay using the regular YouTube player.

**Detailed Description:**

Watch a video without losing sight of the YouTube page you were browsing.

See the video's title above the player and its publication date and view count below. Live videos display their watching count when available.

Use the always-visible overlay button beside a video or Short's three-dot menu to open a centered player above a dimmed background. Alternatively, choose Click thumbnail in settings to open overlays by clicking the thumbnail itself. Choose the opening mode, player size, and background darkness from the settings page. Shorts play as portrait videos with regular player controls.

Click the extension icon for a minimal popup with size and darkness sliders and an appearance preview. Right-click the icon and select Options for the full settings page. Choose light or dark mode on that page; the popup follows your choice automatically.

Press Escape, click outside, or use the close button to stop playback and return to browsing. Choose Go to watch page to continue watching on the full page, or Picture in picture to continue in YouTube's own bottom-right miniplayer where available. Modified clicks still open videos in new tabs normally.

Settings stay on your device. No analytics or extension-operated servers.

**Category:** Productivity

**Single Purpose:** Display YouTube videos in a configurable overlay when their thumbnails are clicked.

**Primary Language:** English

## Graphics & Assets

| Asset | Dimensions | Status |
|---|---|---|
| Store icon | 128×128 PNG | Ready: icons/icon-128.png |
| Overlay screenshot | 1280×800 or 640×400 | Capture after live verification |
| Settings screenshot | 1280×800 or 640×400 | Capture after live verification |
| Small promo tile | 440×280 | Not created |

## Permissions Justification

| Permission / access | Type | Justification |
|---|---|---|
| storage | permissions | Remember the user's enable switch, overlay opening mode, size, and background darkness locally. |
| https://www.youtube.com/* | content_scripts.matches | Detect YouTube thumbnail clicks and display the native player over the browsing page. The small main-world script requests regular YouTube navigation and native player resizing/pausing. |

No separate host_permissions, tabs, scripting, webRequest, or all-sites access.

## Privacy & Data Use

**Does the extension collect user data?** No off-device collection. Preferences are saved with chrome.storage.local. The source page URL and scroll position are held temporarily in page memory to restore browsing. No playback history is persisted by the extension. YouTube continues its own ordinary playback and account processing.

The interface theme preference is saved in extension-local localStorage. The creator credit links to https://github.com/hgurb and opens only when clicked. Settings screenshots should cover both light and dark themes. No additional permissions were introduced.

- [x] Data is NOT sold to third parties.
- [x] Data is NOT used for purposes unrelated to the extension's core functionality.
- [x] Data is NOT used for creditworthiness or lending purposes.

## Privacy Policy

Policy draft: [PRIVACY.md](PRIVACY.md). Public policy URL required before submission.

## Distribution & Developer Info

Visibility, regions, publisher name, contact email, and support URL: to be supplied before publishing.

## Version History

| Version | Date | Changes | Status |
|---|---|---|---|
| 0.1.0 | 2026-11-23 | Initial private GitHub release with native player overlay, regular-player Shorts, appearance popup, full settings, title/date/count metadata, faster closing and optional direct-Back Home feed preservation. | Experimental GitHub release; not submitted to Chrome Web Store |

## Review Notes / Known Limitations

2026-11-05 optional Home preservation: added Keep Home feed when going Back to the full settings page, off by default. Ordinary video navigation can save one temporary feed/scroll backup per tab. Only direct backward history traversal from the first video to the matching Home entry restores it. Any onward navigation releases the backup; Forward and ordinary Home navigation (logo, bookmark, typed URL or other link) retain native behavior. No additional permissions, requests or persisted feed data. The popup retains only appearance controls and preserves this option when saving. Tests cover defaults, saving/reset, Back versus ordinary navigation and Forward, disabling, delayed replacements, and tab isolation. Live-site behavior remains to be verified.

2026-11-03 smoother closing: remove the video, shade and controls immediately while retaining the original feed viewport until YouTube returns. Another overlay request during that transition is queued for the restored source route. Compare saved/current feed contents before restoring; unchanged feeds and equivalent replacement objects no longer trigger native renderer setters. The settling guard checks replacement references rather than comparing entire feeds every frame, and abandoned returns release their backups. Added regressions for delayed navigation, missing finish events, unchanged/equivalent data, changed data before reveal, queued opening and unrelated navigation. No new permissions or persistent data. Live YouTube smoothness remains to be verified.

2026-11-02 date parity: rechecked youtube-date-next-to-sub and matched its updated publication-age format: calendar years plus remaining months, or calendar months plus remaining days, with month-end/leap-year clamping. Under a month, retain its native short relative wording/fallback behavior. The exact date and weekday stay unchanged, as do live stream-age labels. Added boundary coverage. Refresh metadata screenshots.

2026-10-29 feed preservation: capture one source page's renderer data before overlay navigation, including rich-grid/section continuation data. On returning to the exact source URL, restore through YouTube's native data properties and guard briefly against delayed replacements until user interaction. No cloned static feed, intercepted network requests, new permissions, or persistent storage. Snapshots are released after settling or abandonment. Added a regression test covering changed recommendation data, in-place mutation, continuation restoration, delayed overwrites and user-initiated continuation. Live YouTube behavior remains unverified; read-only/unavailable renderer data still rely on native caching.

2026-10-29 fullscreen fix: detect fullscreen on the native player or any containing YouTube/page element. Expand the player and video surface to the full viewport, hide the feed/backdrop/custom toolbar during fullscreen, and resize the native player in fullscreen too. Exiting restores the configured overlay dimensions without moving the player. Added a regression check for document-level fullscreen and exit. Live Chrome fullscreen presentation remains to be verified.

2026-10-29 close behavior: renamed the action to Miniplayer ↘. Clicks outside the player and its controls/text close the overlay; player and metadata clicks keep it open. Removed the 2.5-second suppression timeout and generic pointer reset so delayed native miniplayer activation from a closed overlay stays blocked until deliberate video playback/opening. Hidden stale miniplayer containers are restored when allowed again. Regression checks cover protected text/player clicks, backdrop dismissal, delayed activation, explicit handoff and normal watch-page navigation. Refresh toolbar screenshots.

2026-10-29 age labels: prefer YouTube's own relativeDateText for publication/live ages. Fallback ages now use years/months/weeks/days/hours/minutes/seconds instead of unbounded day counts. Reuse only the other date extension's raw calendar date, so its older day-only fallback cannot override these labels. Active streams show Started streaming … ago using YouTube's wording or the actual broadcast start timestamp.

2026-10-29 metadata: added title at top left and publication date plus view/watching count at bottom left. Date format matches youtube-date-next-to-sub, including weekday/relative age and calendar-day preservation. Current-video metadata is read from the player and watch page with a one-second refresh while open; no new requests, permissions, or persistent data. Missing fields are left blank. Update overlay screenshots. Automated checks cover title/count rendering, live counts and date formatting; live-site presentation still needs verification.

2026-10-29 positioning: Picture in picture ↘ now sits just below the overlay player's bottom-right corner and follows player size/window changes. Go to watch page and Close stay above the player. Refresh the overlay screenshot.

2026-10-28 artwork: added a charcoal/red floating-video icon with transparent exterior. Separate PNGs at 16, 24, 32, 48 and 128 pixels are registered for Chrome's extension listing and toolbar. Master artwork and generation prompt are saved in icons/. Refresh toolbar screenshots with the new icon.

2026-10-28 popup navigation: added an accessible top-right settings cog opening the full options page. Existing appearance controls and inherited theme remain unchanged. Refresh the popup screenshot.

2026-10-28 minimal popup: restored the toolbar popup with only size and darkness sliders, a small header, and collapsible appearance preview. It reads the settings page's theme with no theme toggle. Slider writes preserve the other saved settings. Removed the now-unused background service worker. Update popup screenshots. Automated checks cover minimal controls, preference preservation, preview updates, and shared theme; no permissions added.

2026-10-28 missing-button correction: recognize div-based modern home lockups, generic image thumbnail links, and menus using aria-haspopup=true. Search nearby single-video wrappers when an exact renderer selector fails, without borrowing another card's menu. Added regression coverage for both layouts. Live signed-in home-page placement still requires verification.

2026-10-28 placement update: moved the overlay action into each card's metadata row, immediately before its three-dot menu, for videos and Shorts. Thumbnail/preview overlays have been removed. Picture in picture is hidden whenever disabled and updates when YouTube changes its native control's availability. Refresh thumbnail and toolbar screenshots. Automated checks cover menu adjacency, Shorts, persistent controls during previews, and hidden-state updates; live card layouts remain unverified.

2026-10-28 availability correction: label is now Picture in picture ↘. The control no longer requires YouTube's old visible miniplayer toolbar button. Without it, use the optional native minimization method when present and source-page navigation with playback preserved. Ordinary close still stops playback. Automated coverage includes the fallback; live YouTube activation remains unverified.

2026-10-28 controls update: removed popup files and registered an action service worker that opens the options page. Added explicit Picture in picture handoff using YouTube's own miniplayer control (disabled when absent). Ordinary close stops playback and briefly guards against automatic miniplayer creation during return navigation. Go to watch page remains middle-clickable. Thumbnail buttons use a persistently visible 40 px expand icon and are reattached after card content replacement. Refresh overlay/thumbnail/settings screenshots. Simulated tests cover these transitions; live YouTube miniplayer behavior still needs verification.

2026-10-28 opening-mode update: top-left thumbnail/preview overlay button is the default, with Click thumbnail as an alternative in popup and options. Existing preferences without a mode use the button default. New cards are detected as YouTube loads them. Settings and thumbnail screenshots need refreshing. Regression checks cover normal navigation in button mode, overlay opening for videos/Shorts, dynamic cards, preview positioning, mode switching, and shared UI persistence. Live YouTube hover-preview behavior remains to be verified.

2026-10-28 prototype fixes: Open watch page now supports native middle-click and modified clicks. Preserve source document height before navigation and restore scroll across delayed YouTube resets. Remove close-time hard refresh. Keep video ancestors visible and remove their clipping/paint containment to address black video with captions visible. Added regression checks for navigation links, ancestor cleanup, and late scroll resets. Live Chrome verification of this fix remains pending: the native automation surface failed to provide actionable geometry and then timed out capturing the window.

Live YouTube navigation, fullscreen, cached-feed restoration, accessibility, and other player extensions need real-browser acceptance testing. Uses YouTube's internal navigation event and DOM, which can change. Playback restrictions remain in effect. Not affiliated with YouTube or Google.

Not ready for store submission: live validation, store assets, publisher details, and a hosted privacy policy are outstanding.
