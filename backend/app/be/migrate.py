"""Explicitly install BE's private schema; never run on application startup."""
from pathlib import Path

import psycopg
from dotenv import load_dotenv

from .postgres import PostgresStore


def main():
    root = Path(__file__).resolve().parents[2]
    load_dotenv(root / ".env")
    store = PostgresStore.from_environment()
    migrations = sorted((root / "migrations/be").glob("[0-9][0-9][0-9]_*.sql"))
    with psycopg.connect(**store.parameters) as conn:
        conn.execute("SELECT pg_advisory_xact_lock(847310011)")
        for path in migrations:
            conn.execute(path.read_text(encoding="utf-8"))
    print("DION BE schema installed; application login is configured separately.")


if __name__ == "__main__":
    main()
