"""Verify the exported package without installing dependencies or changing data."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "PACKAGE_MANIFEST.json").read_text(encoding="utf-8"))
errors = []
for row in manifest["files"]:
    path = ROOT / row["path"]
    if not path.is_file():
        errors.append(f"missing: {row['path']}")
    elif hashlib.sha256(path.read_bytes()).hexdigest() != row["sha256"]:
        errors.append(f"changed: {row['path']}")
if errors:
    raise SystemExit("\n".join(errors))
print(f"PASS: {len(manifest['files'])} packaged files match SHA-256 manifest")
print("The manifest describes this export; regenerate after intentional edits.")
