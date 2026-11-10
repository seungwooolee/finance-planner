"""PostgreSQL backend. Schema installation is an explicit CLI action."""
import os
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

from .raw_store import PocError
from .store import BackendStore


class Row(dict):
    def __getitem__(self, key):
        return list(self.values())[key] if isinstance(key, int) else super().__getitem__(key)


class Cursor:
    def __init__(self, cursor):
        self.cursor = cursor

    def fetchone(self):
        value = self.cursor.fetchone()
        return Row(value) if value is not None else None

    def fetchall(self):
        return [Row(r) for r in self.cursor.fetchall()]

    def __iter__(self):
        return iter(self.fetchall())


class Connection:
    def __init__(self, connection):
        self.connection = connection

    def execute(self, sql, parameters=()):
        return Cursor(self.connection.execute(sql.replace("?", "%s"), parameters))

    def close(self):
        self.connection.close()


class PostgresStore(BackendStore):
    def __init__(self, connection_parameters):
        self.parameters = dict(connection_parameters)

    @classmethod
    def from_environment(cls):
        names = {"host": "DION_DB_HOST", "user": "DION_DB_USER", "password": "DION_DB_PASSWORD"}
        parameters = {key: os.getenv(name) for key, name in names.items()}
        if not all(parameters.values()):
            raise PocError("DB_CONFIG_MISSING")
        parameters.update(port=int(os.getenv("DION_DB_PORT", "5432")),
                          dbname=os.getenv("DION_DB_NAME", "postgres"),
                          sslmode="require", connect_timeout=10)
        return cls(parameters)

    def _connect(self):
        conn = psycopg.connect(**self.parameters, autocommit=True,
                               row_factory=dict_row, prepare_threshold=None)
        conn.execute("SET search_path TO dion_be, pg_catalog")
        return Connection(conn)

    @contextmanager
    def _transaction(self, write=False):
        conn = None
        try:
            conn = self._connect()
            # Snapshot-consistent reads; mutations serialize on the consultation row.
            conn.execute("BEGIN ISOLATION LEVEL READ COMMITTED" if write
                         else "BEGIN ISOLATION LEVEL REPEATABLE READ")
            yield conn
            conn.execute("COMMIT")
        except Exception as exc:
            if conn is not None:
                conn.execute("ROLLBACK")
            if isinstance(exc, psycopg.Error):
                raise PocError("STORAGE_FAILURE") from exc
            raise
        finally:
            if conn is not None:
                conn.close()

    @staticmethod
    def _authorize(conn, actor_id, case_id):
        row = conn.execute("SELECT * FROM cases WHERE case_id=? FOR UPDATE", (case_id,)).fetchone()
        if row is None or row["actor_id"] != actor_id:
            raise PocError("NO_ACCESS")
        return row
