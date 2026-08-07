#!/usr/bin/env bash
#
# Apply SQL migrations to a Supabase project, in order, non-interactively.
#
#   scripts/apply-migrations.sh <url-file> <migration.sql> [more.sql ...]
#
# The connection string is read from a gitignored file and handed to Prisma
# through the environment -- never as a command-line argument. Argv is
# world-readable via `ps` on a shared machine, and anything echoed here would
# end up in a chat transcript. One DB password has already leaked that way on
# this project; this is the reason for the indirection.
#
# Prisma sends each file as a SINGLE command, so Postgres wraps it in an
# implicit transaction: a migration either lands whole or not at all. That is
# what we want for DDL like 031-035.
#
# Get the URL from: Supabase dashboard -> Project Settings -> Database ->
# Connection string -> URI, "Session pooler" (IPv4-friendly, and unlike the
# transaction pooler on 6543 it handles DDL and multi-statement scripts).

set -euo pipefail

usage() {
  echo "usage: $0 <url-file> <migration.sql> [more.sql ...]" >&2
  exit 2
}

[ $# -ge 2 ] || usage

URL_FILE="$1"; shift

[ -f "$URL_FILE" ] || { echo "no such url file: $URL_FILE" >&2; exit 1; }

# tr strips the trailing newline a text editor will add, plus any stray
# whitespace from copy-paste out of the dashboard.
DB_URL="$(tr -d '[:space:]' < "$URL_FILE")"
[ -n "$DB_URL" ] || { echo "url file is empty: $URL_FILE" >&2; exit 1; }

case "$DB_URL" in
  postgres://*|postgresql://*) ;;
  *) echo "does not look like a postgres URL (expected postgresql://...)" >&2; exit 1 ;;
esac

# Report which host we are about to touch WITHOUT revealing user or password.
# Applying migrations to the wrong project is the expensive mistake here.
HOST_ONLY="$(printf '%s' "$DB_URL" | sed -E 's#^[^@]*@##; s#[/?].*$##')"
echo "target host: $HOST_ONLY"
echo "migrations : $*"
echo

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAILED=0

for f in "$@"; do
  if [ ! -f "$f" ]; then
    echo "!! missing migration file: $f" >&2
    exit 1
  fi
  # Prisma resolves --file relative to CWD; make it absolute so this works
  # regardless of where the caller ran from.
  ABS="$(cd "$(dirname "$f")" && pwd)/$(basename "$f")"

  printf '>>> %-52s ' "$(basename "$f")"

  # --schema (not --url) so the connection string travels in the environment.
  # schema.prisma declares directUrl = env("DIRECT_URL"), which Prisma
  # requires to be set even when unused, so both point at the same place.
  if out="$(cd "$ROOT/backend" \
      && DATABASE_URL="$DB_URL" DIRECT_URL="$DB_URL" \
         npx --no-install prisma db execute \
           --schema prisma/schema.prisma --file "$ABS" 2>&1)"; then
    echo "OK"
  else
    echo "FAILED"
    # Scrub anything URL-shaped before surfacing the error -- Prisma echoes
    # the datasource in some failure modes.
    printf '%s\n' "$out" \
      | sed -E 's#postgres(ql)?://[^[:space:]]*#postgresql://<redacted>#g' >&2
    FAILED=1
    break
  fi
done

echo
if [ "$FAILED" -eq 0 ]; then
  echo "All migrations applied to $HOST_ONLY"
else
  echo "Stopped on first failure. Nothing after the failed file was run." >&2
  exit 1
fi
