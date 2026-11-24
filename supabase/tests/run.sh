#!/usr/bin/env bash
# Applies the Supabase stub, all migrations and the seed to an empty Postgres
# database, then runs the access-rule tests. Usage: DATABASE_URL=postgres://... ./run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?set DATABASE_URL to an empty Postgres 15+ database}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f tests/supabase_stub.sql
for f in migrations/*.sql; do
  echo "applying $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f seed.sql
for t in tests/*_test.sql; do
  echo "running $t"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -o /dev/null -f "$t"
done
echo "all database tests passed"
