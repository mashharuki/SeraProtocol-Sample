#!/usr/bin/env bash
#
# Sera FX Bot — Cloud Run 破棄スクリプト
#
# Telegram webhook を解除し、Cloud Run サービスを削除します。
# --with-secrets を付けると Secret Manager のシークレットも削除します。
#
# Usage:
#   ./scripts/destroy.sh                # サービスのみ削除（確認プロンプトあり）
#   ./scripts/destroy.sh --with-secrets # シークレットも削除
#   ./scripts/destroy.sh --yes          # 確認プロンプトをスキップ
#
set -euo pipefail
cd "$(dirname "$0")/.."

SERVICE_NAME="${SERVICE_NAME:-sera-fx-bot}"
REGION="${REGION:-asia-northeast1}"

WITH_SECRETS=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --with-secrets) WITH_SECRETS=1 ;;
    --yes | -y) ASSUME_YES=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWARN:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# ---- .env の読み込み（webhook 解除に TELEGRAM_BOT_TOKEN が要る） ----
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
[[ -n "$PROJECT_ID" && "$PROJECT_ID" != "(unset)" ]] ||
  die "GCP プロジェクトが未設定です"

info "Project: ${PROJECT_ID} / Region: ${REGION} / Service: ${SERVICE_NAME}"
if [[ "$WITH_SECRETS" == "1" ]]; then
  info "Secret Manager のシークレットも削除します"
fi

if [[ "$ASSUME_YES" != "1" ]]; then
  read -r -p "本当に削除しますか？ [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || { echo "中止しました"; exit 0; }
fi

# ---- 1. Telegram webhook の解除 ----
if [[ -n "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  info "Telegram webhook を解除しています"
  DELETE=1 bun scripts/set-webhook.ts || warn "webhook の解除に失敗しました（続行します）"
else
  warn "TELEGRAM_BOT_TOKEN が無いため webhook 解除をスキップします"
fi

# ---- 2. Cloud Run サービスの削除 ----
if gcloud run services describe "$SERVICE_NAME" \
  --project "$PROJECT_ID" --region "$REGION" >/dev/null 2>&1; then
  info "Cloud Run サービスを削除しています: ${SERVICE_NAME}"
  gcloud run services delete "$SERVICE_NAME" \
    --project "$PROJECT_ID" --region "$REGION" --quiet
else
  warn "サービス ${SERVICE_NAME} は存在しません（スキップ）"
fi

# ---- 3. シークレットの削除（--with-secrets 時のみ） ----
if [[ "$WITH_SECRETS" == "1" ]]; then
  SECRET_VARS=(
    TELEGRAM_BOT_TOKEN
    TELEGRAM_WEBHOOK_SECRET
    PRIVY_APP_ID
    PRIVY_APP_SECRET
    ANTHROPIC_API_KEY
    DATABASE_URL
    DATABASE_AUTH_TOKEN
  )
  for var in "${SECRET_VARS[@]}"; do
    secret_name="${SERVICE_NAME}-$(tr '[:upper:]_' '[:lower:]-' <<<"$var")"
    if gcloud secrets describe "$secret_name" --project "$PROJECT_ID" >/dev/null 2>&1; then
      info "シークレット削除: ${secret_name}"
      gcloud secrets delete "$secret_name" --project "$PROJECT_ID" --quiet
    fi
  done
fi

info "完了しました"
