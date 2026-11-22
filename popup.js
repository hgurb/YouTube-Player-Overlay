(() => {
  const fields = { size: document.querySelector("#size"), darkness: document.querySelector("#darkness") };
  const status = document.querySelector("#status");
  let pending = {};
  let saving = false;
  function paint() {
    for (const key of Object.keys(fields)) {
      document.querySelector(`#${key}-value`).value = `${fields[key].value}%`;
      fields[key].setAttribute("aria-valuetext", `${fields[key].value}%`);
    }
    document.querySelector("#preview").style.setProperty("--size", `${fields.size.value}%`);
    document.querySelector("#preview").style.setProperty("--darkness", Number(fields.darkness.value) / 100);
  }
  function render(settings) {
    for (const key of Object.keys(fields)) if (!(key in pending)) fields[key].value = settings[key];
    paint();
  }
  function error(message) { status.hidden = false; status.textContent = message; }
  document.querySelector("#open-settings").addEventListener("click", () => {
    void (async () => {
      try { await chrome.runtime.openOptionsPage(); }
      catch { error("Could not open settings. Try again."); }
    })();
  });
  async function save(key) {
    pending[key] = Number(fields[key].value);
    paint();
    if (saving) return;
    saving = true;
    try {
      while (Object.keys(pending).length) {
        // Merge just the changed sliders into the latest saved settings, preserving
        // the enable switch and opening mode managed by the full settings page.
        const patch = pending;
        pending = {};
        const latest = (await chrome.storage.local.get("settings")).settings;
        await chrome.storage.local.set({ settings: YPO.normalize({ ...latest, ...patch }) });
      }
      status.hidden = true;
    } catch { error("Could not save. Try again."); }
    finally { saving = false; }
  }
  for (const [key, field] of Object.entries(fields)) field.addEventListener("input", () => void save(key));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings && !saving) render(YPO.normalize(changes.settings.newValue));
  });
  void (async () => {
    try {
      render(YPO.normalize((await chrome.storage.local.get("settings")).settings));
      for (const field of Object.values(fields)) field.disabled = false;
    } catch { error("Could not load settings. Reopen the popup to retry."); }
  })();
})();
