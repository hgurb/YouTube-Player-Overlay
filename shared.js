/* Shared by the isolated content script, settings popup, and Node tests. */
(() => {
  const defaults = Object.freeze({ enabled: true, preserveHomeFeed: false, openMode: "button", size: 65, darkness: 85 });
  function normalize(value = {}) {
    if (!value || typeof value !== "object") value = {};
    const percent = (key, min, max) => typeof value[key] === "number" && Number.isFinite(value[key])
      ? Math.max(min, Math.min(max, Math.round(value[key]))) : defaults[key];
    return { enabled: typeof value.enabled === "boolean" ? value.enabled : defaults.enabled,
      preserveHomeFeed: value.preserveHomeFeed === true,
      openMode: value.openMode === "thumbnail" ? "thumbnail" : "button",
      size: percent("size", 25, 95), darkness: percent("darkness", 0, 100) };
  }
  function videoLink(href, base = "https://www.youtube.com/") {
    try {
      const url = new URL(href, base);
      if (url.origin !== "https://www.youtube.com") return null;
      const short = /^\/shorts\/([\w-]{11})\/?$/.exec(url.pathname);
      const id = short?.[1] ?? (url.pathname === "/watch" ? url.searchParams.get("v") : null);
      if (!id || !/^[\w-]{11}$/.test(id)) return null;
      const params = new URLSearchParams({ v: id });
      for (const key of ["list", "index", "t", "start"]) {
        if (url.searchParams.has(key)) params.set(key, url.searchParams.get(key));
      }
      return { id, short: Boolean(short), path: `/watch?${params}` };
    } catch { return null; }
  }
  function dimensions(width, height, size, ratio = 16 / 9) {
    const fraction = normalize({ size }).size / 100;
    const w = Math.min(width * fraction, height * fraction * ratio);
    return { width: Math.round(w), height: Math.round(w / ratio) };
  }
  function relativeAge(timestamp, now = Date.now()) {
    const instant = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
    if (!Number.isFinite(instant) || instant > now) return "";
    const seconds = Math.floor((now - instant) / 1000);
    const formatter = new Intl.RelativeTimeFormat("en-US", { numeric: "always" });
    for (const [unit, size] of [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]]) {
      if (seconds >= size || unit === "second") return formatter.format(-Math.floor(seconds / size), unit);
    }
    return "";
  }
  function publicationDate(value, age, now = Date.now()) {
    const match = typeof value === "string" && /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(value);
    if (!match) return "";
    const date = match[1];
    const calendar = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== date) return "";
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(calendar);
    const timestamp = /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
    const start = new Date(Number.isFinite(timestamp) ? timestamp : calendar.getTime());
    const current = new Date(now);
    // Match youtube-date-next-to-sub: complete calendar months, clamped to the
    // last day of the destination month (Jan 31 -> Feb 28), not 30-day buckets.
    function afterMonths(count) {
      const anchor = new Date(start);
      anchor.setUTCDate(1);
      anchor.setUTCMonth(start.getUTCMonth() + count);
      const end = new Date(anchor);
      end.setUTCMonth(anchor.getUTCMonth() + 1, 0);
      anchor.setUTCDate(Math.min(start.getUTCDate(), end.getUTCDate()));
      return anchor;
    }
    let months = (current.getUTCFullYear() - start.getUTCFullYear()) * 12 + current.getUTCMonth() - start.getUTCMonth();
    if (months > 0 && afterMonths(months) > current) months--;
    const part = (count, unit) => `${count} ${unit}${count === 1 ? "" : "s"}`;
    if (months >= 12) {
      const years = Math.floor(months / 12);
      const remainder = months % 12;
      age = `${part(years, "year")}${remainder ? ` and ${part(remainder, "month")}` : ""} ago`;
    } else if (months >= 1) {
      const days = Math.floor((now - afterMonths(months).getTime()) / 86400000);
      age = `${part(months, "month")}${days ? ` and ${part(days, "day")}` : ""} ago`;
    } else if (age) {
      age = /\b(?:\d{1,5}|an?|one)\s+(?:second|minute|hour|day|week|month|year)s?\s+ago\b/i.exec(age)?.[0]?.toLowerCase() || "";
    }
    if (!age) {
      const formatter = new Intl.RelativeTimeFormat("en-US", { numeric: "always" });
      if (Number.isFinite(timestamp) && now >= timestamp) {
        const seconds = Math.floor((now - timestamp) / 1000);
        for (const [unit, size] of [["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]]) {
          if (seconds >= size || unit === "second") { age = formatter.format(-Math.floor(seconds / size), unit); break; }
        }
      } else {
        const days = Math.floor(now / 86400000) - Math.floor(calendar.getTime() / 86400000);
        if (days >= 0) age = days === 0 ? "today" : `about ${formatter.format(-days, "day")}`;
      }
    }
    return `${date}, ${weekday}${age ? ` (${age})` : ""}`;
  }
  globalThis.YPO = Object.freeze({ defaults, normalize, videoLink, dimensions, publicationDate, relativeAge });
})();
