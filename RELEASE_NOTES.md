# YouTube Player Overlay v0.1.0

Initial GitHub release.

- Open videos and Shorts in an adjustable overlay with YouTube's native player.
- Choose an always-visible overlay action or thumbnail clicks.
- Adjust size and background darkness from the popup; use the full settings page for opening mode, light/dark appearance and optional Home feed preservation.
- See the title, view/watching count and publication date or live streaming age.
- Close immediately while retaining the feed during return navigation.
- Optionally preserve Home only for Home → video → Back. Navigating onward releases the backup. Each tab keeps its own temporary backup; the option defaults to off.
- Continue on the watch page or request YouTube's native miniplayer where available.

## Install

1. Download `YouTube-Player-Overlay-v0.1.0.zip` from this release and extract it to a permanent folder.
2. Open `chrome://extensions`, enable Developer mode, and choose Load unpacked.
3. Select the extracted folder containing `manifest.json`, then refresh YouTube.

## Validation and limits

All 54 automated tests and JavaScript syntax checks pass. The ZIP contains only extension runtime files and correctly sized icons, with `manifest.json` at its root.

This is an experimental release. Live YouTube playback, feed restoration and compatibility with other player extensions still need verification. YouTube's internal navigation/renderer changes may affect behavior, and native miniplayer handoff remains experimental. This release is not a Chrome Web Store publication.
