# Supabase

Project: `hours-tracker`, region `eu-central-1` (Frankfurt).

- `migrations/` — schema, applied in filename order with the Supabase MCP `apply_migration` tool (name = the part after the timestamp).
- `tests/` — security tests. Paste a file into Dashboard → SQL Editor and Run (the MCP `execute_sql` tool declines write statements without an interactive confirmation). Every test wraps itself in `begin … rollback` — nothing is kept — and ends with a single `… all checks passed` row, or raises `FAIL n: …`.

Never put the service-role/secret key in the browser or in this repo.
