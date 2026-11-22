const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../shared.js');
const { normalize, videoLink, dimensions } = global.YPO;

test('publication date matches the date extension format without shifting the calendar day', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  assert.equal(global.YPO.publicationDate('2026-10-29T23:00:00-07:00', '2 hours ago', now), '2026-10-29, Thu (2 hours ago)');
  assert.equal(global.YPO.publicationDate('2026-10-29', null, now), '2026-10-29, Thu (today)');
  assert.equal(global.YPO.publicationDate('2026-02-30', null, now), '');
  assert.equal(global.YPO.publicationDate('2010-05-27', '16 years ago', now), '2010-05-27, Thu (16 years and 5 months ago)');
  assert.equal(global.YPO.relativeAge('2026-10-29T10:00:00Z', now), '2 hours ago');
});

test('publication age matches calendar month/day and leap-year boundaries', () => {
  assert.equal(global.YPO.publicationDate('2026-09-15', null, Date.parse('2026-11-02T12:00:00Z')), '2026-09-15, Tue (1 month and 18 days ago)');
  assert.equal(global.YPO.publicationDate('2026-01-31', null, Date.parse('2026-02-28T12:00:00Z')), '2026-01-31, Sat (1 month ago)');
  assert.equal(global.YPO.publicationDate('2024-02-29', null, Date.parse('2025-02-28T12:00:00Z')), '2024-02-29, Thu (1 year ago)');
  assert.equal(global.YPO.publicationDate('2026-10-31', 'Streamed 2 days ago', Date.parse('2026-11-02T12:00:00Z')), '2026-10-31, Sat (2 days ago)');
});

test('settings reject invalid storage and clamp valid numbers', () => {
  assert.deepEqual(normalize(null), { enabled: true, preserveHomeFeed: false, openMode: 'button', size: 65, darkness: 85 });
  assert.deepEqual(normalize({ size: NaN, darkness: '90', enabled: 'false' }), { enabled: true, preserveHomeFeed: false, openMode: 'button', size: 65, darkness: 85 });
  assert.deepEqual(normalize({ size: 1000, darkness: -10, enabled: false }), { enabled: false, preserveHomeFeed: false, openMode: 'button', size: 95, darkness: 0 });
  assert.equal(normalize({ preserveHomeFeed: 'true' }).preserveHomeFeed, false);
  assert.equal(normalize({ openMode: 'thumbnail' }).openMode, 'thumbnail');
  assert.equal(normalize({ openMode: 'bad' }).openMode, 'button');
  assert.equal(normalize({ size: 24 }).size, 25);
});
test('watch links preserve playlist and start time', () => {
  const result = videoLink('/watch?v=dQw4w9WgXcQ&list=PLabc&index=2&t=1m30s&feature=share');
  assert.equal(result.id, 'dQw4w9WgXcQ');
  assert.equal(result.path, '/watch?v=dQw4w9WgXcQ&list=PLabc&index=2&t=1m30s');
  assert.equal(result.short, false);
});
test('Shorts become regular watch URLs', () => {
  assert.deepEqual(videoLink('/shorts/dQw4w9WgXcQ?feature=share'), {
    id: 'dQw4w9WgXcQ', short: true, path: '/watch?v=dQw4w9WgXcQ'
  });
});
test('non-video, malformed and external URLs are not intercepted', () => {
  for (const url of ['/feed/shorts', '/@channel', '/watch?v=invalid', '/shorts/invalid',
    'https://evil.example/watch?v=dQw4w9WgXcQ', 'javascript:alert(1)', '/playlist?list=PLabc']) {
    assert.equal(videoLink(url), null, url);
  }
});
test('portrait and landscape dimensions stay inside both viewport bounds', () => {
  for (const ratio of [16 / 9, 9 / 16]) {
    for (const [width, height] of [[1920, 1016], [800, 600], [600, 1000]]) {
      for (const size of [25, 65, 95]) {
        const result = dimensions(width, height, size, ratio);
        assert.ok(result.width <= width * size / 100 + 1);
        assert.ok(result.height <= height * size / 100 + 1);
        assert.ok(Math.abs(result.width / result.height - ratio) < .02);
      }
    }
  }
});
test('manifest uses MV3, minimal permissions and existing files', () => {
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage']);
  for (const entry of manifest.content_scripts) {
    assert.deepEqual(entry.matches, ['https://www.youtube.com/*']);
    for (const file of [...entry.js, ...(entry.css ?? [])]) assert.ok(fs.existsSync(path.join(root, file)), file);
  }
  assert.ok(fs.existsSync(path.join(root, manifest.action.default_popup)));
  assert.equal(manifest.background, undefined);
});
