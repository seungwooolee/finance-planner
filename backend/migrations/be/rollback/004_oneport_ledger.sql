-- Manual rollback only. Dropping this ledger erases spend/idempotency history:
-- never open a new budget afterwards without reconciling against the gateway usage log.
DROP TABLE dion_be.oneport_aliases, dion_be.oneport_calls, dion_be.oneport_budget_grants, dion_be.oneport_ledger_identity;
