import json
from unittest.mock import patch

import pytest

from app.be.migrate import main


def test_single_migration_plan_is_offline_and_excludes_rollback(capsys):
    with patch("sys.argv", ["migrate", "--only", "002_agent_sessions.sql", "--plan"]), patch("psycopg.connect", side_effect=AssertionError("offline")):
        main()
    plan = json.loads(capsys.readouterr().out)
    assert not plan["database_changed"] and not plan["database_connected"]
    assert [p["file"] for p in plan["migrations"]] == ["002_agent_sessions.sql"]
    assert len(plan["migrations"][0]["sha256"]) == 64


def test_rollback_cannot_be_selected_for_apply():
    with patch("sys.argv", ["migrate", "--only", "rollback/002_agent_sessions.sql"]), patch("psycopg.connect", side_effect=AssertionError("no connection")):
        with pytest.raises(SystemExit) as exc:
            main()
    assert exc.value.code == 2


def test_session_heads_plan_is_additive_offline_and_keeps_previous_migrations(capsys):
    with patch("sys.argv", ["migrate", "--only", "003_agent_session_heads.sql", "--plan"]), patch("psycopg.connect", side_effect=AssertionError("offline")):
        main()
    plan = json.loads(capsys.readouterr().out)
    assert not plan["database_connected"] and not plan["database_changed"]
    assert [p["file"] for p in plan["migrations"]] == ["003_agent_session_heads.sql"]
