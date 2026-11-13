-- Manual rollback only. Removes step 5-6 records; analysis runs and answers are untouched.
SET LOCAL search_path TO dion_be, pg_catalog;
DROP TABLE IF EXISTS monthly_checkins;
DROP TABLE IF EXISTS plan_adoptions;
