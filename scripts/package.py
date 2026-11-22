"""Build a runtime-only ZIP with manifest.json at its root."""
import hashlib
import json
import re
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
files = {"manifest.json"}
for pattern in ("*.js", "*.css", "*.html"):
    files.update(p.relative_to(root).as_posix() for p in root.glob(pattern))

required = set(manifest["icons"].values()) | set(manifest["action"]["default_icon"].values())
files.update(required)
required.update((manifest["options_ui"]["page"], manifest["action"]["default_popup"]))
for entry in manifest["content_scripts"]:
    required.update(entry.get("js", []))
    required.update(entry.get("css", []))
for name in tuple(files):
    if name.endswith(".html"):
        for ref in re.findall(r'(?:src|href)="([^"]+)"', (root / name).read_text(encoding="utf-8")):
            if not re.match(r"(?:[a-z]+:|#|/)", ref):
                required.add(ref)
if required - files:
    raise SystemExit(f"Missing packaged references: {sorted(required - files)}")

destination = root / "dist" / f"YouTube-Player-Overlay-v{manifest['version']}.zip"
destination.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
    for name in sorted(files):
        archive.write(root / name, name)
with zipfile.ZipFile(destination) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == files
    assert json.loads(archive.read("manifest.json"))["version"] == manifest["version"]
print(json.dumps({"file": str(destination), "files": len(files), "bytes": destination.stat().st_size,
                  "sha256": hashlib.sha256(destination.read_bytes()).hexdigest()}))
