#!/usr/bin/env bash
# Derived from the Notion M00 preflight v0.1 (2026-10-04).
set -euo pipefail
umask 077
fail() { printf '%s\n' "$1" >&2; exit 2; }
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ ${1:-} == --help ]]; then
  printf 'Usage: ARGO_ENV=DEV|TEST PGSERVICE=alias ... %s\nSee README.md; explicit local authorization required before any connection.\n' "$0"
  exit 0
fi
[[ $# == 0 ]] || fail 'Unexpected arguments; see --help.'
case ${ARGO_ENV:-} in DEV|TEST) ;; *) fail 'ARGO_ENV must be DEV or TEST.' ;; esac
[[ ${PGSERVICE:-} =~ ^[A-Za-z0-9_-]+$ ]] || fail 'PGSERVICE must be a local service alias.'
[[ ${M00_AUTHORIZED:-} == "$ARGO_ENV" ]] || fail 'Verify resource, environment and read authorization locally; then set M00_AUTHORIZED to ARGO_ENV.'
for dep in psql pg_dump python3 mktemp date cp; do
  command -v "$dep" >/dev/null || fail "Missing dependency: $dep"
done
# Explicit configuration only; reject ambient connection overrides.
for name in PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD; do
  [[ ! -v $name ]] || fail "Unset ambient $name; use service/passfile."
done
python3 - <<'PY'
import os, pathlib, stat
for name in ('PGSERVICEFILE', 'PGPASSFILE'):
    p = pathlib.Path(os.environ.get(name, ''))
    if not p.is_absolute() or not p.is_file():
        raise SystemExit(name + ' must name an existing absolute file')
    s = p.stat()
    if s.st_uid != os.getuid() or stat.S_IMODE(s.st_mode) != 0o600:
        raise SystemExit(name + ' must be owned by the executor with mode 0600')
PY
export PGCONNECT_TIMEOUT=10 PGAPPNAME=argo_m00_preflight
export PGOPTIONS='-c default_transaction_read_only=on -c lock_timeout=5s -c statement_timeout=60s'
[[ ${M00_OUTPUT_ROOT:-} == /* && -d $M00_OUTPUT_ROOT ]] || fail 'M00_OUTPUT_ROOT must be an existing absolute private directory outside the repository.'
run_dir="$(mktemp -d "$M00_OUTPUT_ROOT/M00_${ARGO_ENV}_$(date -u +%Y%m%dT%H%M%SZ)_XXXXXX")"
printf 'Directory evidenze riservata: %s\n' "$run_dir"
cp "$script_dir/inventory.sql" "$script_dir/run_m00.sh" "$run_dir/"
cd -- "$run_dir"
printf 'environment=%s\nstarted_at=%s\ngate_M00=OPEN\n' "$ARGO_ENV" "$(date -u +%FT%TZ)" > run.txt
finalize() {
  rc=$?
  trap - EXIT
  printf 'runner_exit_code=%s\nended_at=%s\n' "$rc" "$(date -u +%FT%TZ)" >> run.txt
  python3 - <<'PY'
from pathlib import Path
import hashlib, json
rows = []
for p in sorted(Path('.').iterdir()):
    if p.is_file() and p.name != 'checksums.json':
        h = hashlib.sha256()
        with p.open('rb') as f:
            for chunk in iter(lambda: f.read(1048576), b''):
                h.update(chunk)
        rows.append(dict(path=p.name, bytes=p.stat().st_size, sha256=h.hexdigest()))
Path('checksums.json').write_text(json.dumps(rows, indent=2) + '\n')
PY
  printf 'Dossier locale: %s — gate M00 OPEN; riesame richiesto.\n' "$run_dir"
  exit "$rc"
}
trap finalize EXIT
psql --version > client_versions.txt
pg_dump --version >> client_versions.txt
set +e
psql -X -w -v ON_ERROR_STOP=1 -Atc \
  'SELECT current_database(),session_user,version(),pg_is_in_recovery(),inet_server_addr(),inet_server_port();' \
  > connection_check.txt 2> connection_check.stderr
connection_rc=$?
set -e
printf 'connection_exit_code=%s\n' "$connection_rc" >> run.txt
[[ $connection_rc == 0 ]] || exit "$connection_rc"
printf 'Verificare localmente connection_check.txt: risorsa %s, ruolo, server >=12 e major client compatibile.\n' "$ARGO_ENV"
read -r -p 'Identità, autorizzazione, versione e finestra senza DDL verificati? Scrivere CONFERMATO: ' answer
[[ $answer == CONFERMATO ]] || fail 'Acquisizione non confermata.'
printf 'operator_confirmation=CONFERMATO\n' >> run.txt
set +e
pg_dump -w --schema-only --format=plain --lock-wait-timeout=5s --file=schema.sql 2> schema.stderr
dump_rc=$?
psql -X -w -v ON_ERROR_STOP=1 -f inventory.sql > inventory.stdout 2> inventory.stderr
inventory_rc=$?
set -e
printf 'dump_exit_code=%s\ninventory_exit_code=%s\n' "$dump_rc" "$inventory_rc" >> run.txt
[[ $dump_rc == 0 && $inventory_rc == 0 ]]
