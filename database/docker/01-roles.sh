#!/usr/bin/env bash
set -euo pipefail

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set ON_ERROR_STOP=1 \
  --set clave_app="$ANDES_APP_CLAVE" \
  --set clave_lector="$ANDES_LECTOR_CLAVE" <<'SQL'
CREATE ROLE andes_app LOGIN PASSWORD :'clave_app';
CREATE ROLE andes_lector LOGIN PASSWORD :'clave_lector';
SQL
