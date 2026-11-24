-- Hardening: this project's default privileges give the API roles TRUNCATE, TRIGGER and
-- REFERENCES on new tables. The API can't issue them, but TRUNCATE ignores row-level
-- security, so take them away from every table in the public schema.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;
