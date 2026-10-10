#!/bin/sh
# Executa uma rota de cron sem permitir duas instancias da MESMA rotina.
#
# O crond dispara por minuto, mas algumas rotas podem legitimamente levar mais
# que isso. Sem a trava, uma rodada lenta abre outra copia no minuto seguinte e
# o acumulo disputa o pool do Supabase com login, Inbox e webhooks.
set -eu

timeout="$1"
rota="$2"
app_origin="$3"
auth_file="$4"

nome_seguro="$(printf '%s' "$rota" | tr -c 'a-zA-Z0-9._-' '_')"
lock_dir="${CRON_LOCK_DIR:-/run/deskcomm-cron/locks}/${nome_seguro}.lock"

mkdir -p "$(dirname "$lock_dir")"
if ! mkdir "$lock_dir" 2>/dev/null; then
  echo "deskcomm-cron: PULOU $rota — a rodada anterior ainda esta em andamento" >&2
  exit 0
fi

liberar_lock() {
  rmdir "$lock_dir" 2>/dev/null || true
}
trap liberar_lock EXIT HUP INT TERM

if ! curl -fsS -m"$timeout" -H "@$auth_file" "$app_origin/$rota" >/dev/null; then
  echo "deskcomm-cron: FALHOU $rota — veja o erro do curl logo acima; se for 401 ou 403, confira INTERNAL_SECRET/INTERNAL_CRON_SECRET no .env e recrie app e scheduler" >&2
  exit 1
fi
