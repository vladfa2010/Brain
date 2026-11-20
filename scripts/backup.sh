#!/usr/bin/env bash
# Дамп базы и вложений в backups/. Ставить в cron/launchd с первого дня.
set -euo pipefail
cd "$(dirname "$0")/.."
source .env 2>/dev/null || true
DB_URL="${DATABASE_URL:-postgres://localhost:5432/secondbrain}"
STAMP="$(date +%Y-%m-%d-%H%M)"
mkdir -p backups
pg_dump "$DB_URL" | gzip > "backups/secondbrain-${STAMP}.sql.gz"
# оставляем последние 14 дампов
ls -1t backups/*.sql.gz | tail -n +15 | xargs -r rm --
echo "backup: backups/secondbrain-${STAMP}.sql.gz"
