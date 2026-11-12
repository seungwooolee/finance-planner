-- Manual rollback only, after explicit approval of consultation memory deletion.
-- Does not delete cases, raw answers, snapshots, runs, or adopted plans.
DROP TABLE dion_be.agent_sessions;
