"""Explicitly install BE's private schema; never run on application startup."""
import argparse
import hashlib
import json
from pathlib import Path

import psycopg
from dotenv import load_dotenv

from .postgres import PostgresStore


def main():
    root = Path(__file__).resolve().parents[2]
    migrations = sorted((root / "migrations/be").glob("[0-9][0-9][0-9]_*.sql"))
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", choices=[p.name for p in migrations], help="Explicit single additive migration")
    parser.add_argument("--plan", action="store_true", help="Print file hashes; never connects to a database")
    args = parser.parse_args()
    if args.only:
        migrations = [p for p in migrations if p.name == args.only]
    if args.plan:
        print(json.dumps({"database_changed": False, "database_connected": False, "migrations": [
            {"file": p.name, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in migrations]}))
        return
    load_dotenv(root / ".env")
    store = PostgresStore.from_environment()
    with psycopg.connect(**store.parameters) as conn:
        conn.execute("SELECT pg_advisory_xact_lock(847310011)")
        for path in migrations:
            conn.execute(path.read_text(encoding="utf-8"))
    print("DION BE schema installed; application login is configured separately.")


if __name__ == "__main__":
    main()
