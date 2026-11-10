"""Read-only external source overlay: engine + latest BE tests and optional UI demo tests.

Copies to a temporary directory; never edits supplied BE/UI sources. Identity is
MOCK; local PostgreSQL skips do not establish production DB verification.
"""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--be-root", type=Path, required=True, help="Unpacked BE dion directory")
    parser.add_argument("--ui-root", type=Path, help="Unpacked submission dion directory")
    parser.add_argument("--raw-store-root", type=Path, help="Original DION_RawAnswer_PoC_v0_1 directory")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    checks = []
    with tempfile.TemporaryDirectory(prefix="dion-engine-integration-") as tmp:
        overlay = Path(tmp) / "dion"
        shutil.copytree(ROOT, overlay, ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache", ".ruff_cache"))
        shutil.copytree(
            args.be_root.resolve() / "backend",
            overlay / "backend",
            dirs_exist_ok=True,
            ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache", ".ruff_cache"),
        )
        # Engine is authoritative only for its own implementation directory.
        shutil.copytree(
            ROOT / "backend/app/planning",
            overlay / "backend/app/planning",
            dirs_exist_ok=True,
            ignore=shutil.ignore_patterns("__pycache__"),
        )

        def run(name, command, cwd, env=None):
            p = subprocess.run(command, cwd=cwd, env=env, text=True, capture_output=True, check=False)
            checks.append(
                {
                    "name": name,
                    "command": command,
                    "cwd_scope": name,
                    "exit_code": p.returncode,
                    "stdout": p.stdout,
                    "stderr": p.stderr,
                }
            )
            print(name, "PASSED" if p.returncode == 0 else "FAILED")

        run("engine_and_BE_overlay", [sys.executable, "-m", "pytest", "-q", "-rs"], overlay / "backend")
        if args.ui_root:
            if not args.raw_store_root:
                parser.error("--raw-store-root required for UI demo integration")
            env = dict(os.environ, DION_BASE_ROOT=str(overlay), DION_RAW_STORE_ROOT=str(args.raw_store_root.resolve()))
            run(
                "submission_demo_HTTP_and_storage",
                [
                    sys.executable,
                    "-m",
                    "unittest",
                    "discover",
                    "-s",
                    "docs/design/2026-11-10/connected-demo",
                    "-p",
                    "test_demo.py",
                    "-v",
                ],
                args.ui_root.resolve(),
                env,
            )
        def fingerprint(p):
            return hashlib.sha256(p.read_bytes()).hexdigest()
        result = {
            "engine_release": "DION-ENGINE-1.2",
            "checks": checks,
            "external_files": {
                "BE_store_sha256": fingerprint(args.be_root / "backend/app/be/store.py"),
                "BE_adapter_sha256": fingerprint(args.be_root / "backend/app/be/adapter.py"),
            },
            "identity": "MOCK",
            "production_authentication_verified": False,
            "question12_adapter_connected_to_host_API": False,
            "dated_cash_connected_to_UI": False,
            "active_legal_rules": 0,
            "state": "PASSED_WITH_REPORTED_SKIPS" if all(c["exit_code"] == 0 for c in checks) else "FAILED",
        }
        if args.output:
            args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        return 0 if all(c["exit_code"] == 0 for c in checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
