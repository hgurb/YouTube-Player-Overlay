// Resolve before styles load, matching SEARCHIT's system-first, remembered choice.
(() => {
  const key = "ypo-theme";
  const system = matchMedia("(prefers-color-scheme: dark)");
  let preference;
  try {
    const stored = localStorage.getItem(key);
    if (stored === "light" || stored === "dark") preference = stored;
  } catch { /* The theme still works when preference storage is unavailable. */ }
  const resolved = () => preference ?? (system.matches ? "dark" : "light");
  function apply() {
    document.documentElement.dataset.theme = resolved();
    const button = document.querySelector("#theme-toggle");
    if (button) {
      const label = `Switch to ${resolved() === "dark" ? "light" : "dark"} mode`;
      button.setAttribute("aria-label", label);
      button.title = label;
    }
  }
  apply();
  document.addEventListener("DOMContentLoaded", () => {
    apply();
    document.querySelector("#theme-toggle")?.addEventListener("click", () => {
      preference = resolved() === "dark" ? "light" : "dark";
      apply();
      try { localStorage.setItem(key, preference); } catch { /* Keep this session's choice. */ }
    });
  });
  system.addEventListener("change", () => { if (!preference) apply(); });
  window.addEventListener("storage", event => {
    if (event.key !== key && event.key !== null) return;
    preference = ["light", "dark"].includes(event.newValue) ? event.newValue : undefined;
    apply();
  });
})();
