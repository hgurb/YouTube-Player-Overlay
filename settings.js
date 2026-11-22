(() => {
  const fields = { enabled: document.querySelector("#enabled"), preserveHomeFeed: document.querySelector("#preserve-home-feed"), openMode: document.querySelector("#open-mode"), size: document.querySelector("#size"), darkness: document.querySelector("#darkness") };
  const status = document.querySelector("#status");
  let revision = 0;
  let pending = null;
  let saving = false;
  function render(settings) {
    fields.enabled.checked = settings.enabled;
    fields.preserveHomeFeed.checked = settings.preserveHomeFeed;
    fields.openMode.value = settings.openMode;
    fields.size.value = settings.size;
    fields.darkness.value = settings.darkness;
    paint();
  }
  function paint() {
    for (const key of ["size", "darkness"]) document.querySelector(`#${key}-value`).value = `${fields[key].value}%`;
    const preview = document.querySelector("#preview");
    preview.style.setProperty("--size", `${fields.size.value}%`);
    preview.style.setProperty("--darkness", fields.darkness.value / 100);
  }
  async function save() {
    revision++;
    pending = YPO.normalize({ enabled: fields.enabled.checked, preserveHomeFeed: fields.preserveHomeFeed.checked, openMode: fields.openMode.value, size: Number(fields.size.value), darkness: Number(fields.darkness.value) });
    paint();
    if (saving) return;
    saving = true;
    try {
      while (pending) {
        const value = pending;
        pending = null;
        await chrome.storage.local.set({ settings: value });
      }
      status.textContent = "Saved on this device";
    } catch { status.textContent = "Could not save. Try again."; }
    finally { saving = false; }
  }
  for (const field of Object.values(fields)) field.addEventListener("input", () => void save());
  document.querySelector("#reset").addEventListener("click", () => { render(YPO.defaults); void save(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings && !saving) render(YPO.normalize(changes.settings.newValue));
  });
  void (async () => {
    try {
      const result = await chrome.storage.local.get("settings");
      if (!revision) render(YPO.normalize(result.settings));
    } catch { status.textContent = "Could not load settings"; }
  })();
})();
