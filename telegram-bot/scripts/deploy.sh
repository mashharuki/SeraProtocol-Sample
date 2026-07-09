#!/usr/bin/env bash
#
# Sera FX Bot — Cloud Run デプロイスクリプト
#
# .env を読み込み、シークレットを Secret Manager に登録し、Cloud Run に
# デプロイして Telegram webhook まで登録します。
#
# Usage:
#   ./scripts/deploy.sh
#
# 前提:
#   - gcloud CLI がインストール・ログイン済み (gcloud auth login)
#   - プロジェクトが選択済み (gcloud config set project <id>) か、.env に GCP_PROJECT_ID
#   - .env に必須値が設定済み (.env.example 参照)
#
set -euo pipefail
cd "$(dirname "$0")/.."

SERVICE_NAME="${SERVICE_NAME:-sera-fx-bot}"
REGION="${REGION:-asia-northeast1}"

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWARN:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# ---- 1. .env の読み込み ----
[[ -f .env ]] || die ".env がありません。 cp .env.example .env して必須値を設定してください"
set -a
# shellcheck disable=SC1091
source .env
set +a

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
[[ -n "$PROJECT_ID" && "$PROJECT_ID" != "(unset)" ]] ||
  die "GCP プロジェクトが未設定です。 gcloud config set project <id> するか .env に GCP_PROJECT_ID を追加してください"

for var in TELEGRAM_BOT_TOKEN PRIVY_APP_ID PRIVY_APP_SECRET; do
  [[ -n "${!var:-}" ]] || die ".env の ${var} が未設定です"
done
[[ -n "${TELEGRAM_WEBHOOK_SECRET:-}" ]] ||
  die ".env の TELEGRAM_WEBHOOK_SECRET が未設定です（webhook モードで必須）。 openssl rand -hex 32 などで生成してください"

if [[ -z "${DATABASE_URL:-}" || "${DATABASE_URL}" == file:* ]]; then
  warn "DATABASE_URL がローカルファイル (${DATABASE_URL:-unset}) です。Cloud Run のファイルシステムは揮発性のため、再起動でデータが消えます。本番は Turso (libsql://...) を推奨します"
fi

info "Project: ${PROJECT_ID} / Region: ${REGION} / Service: ${SERVICE_NAME}"

# ---- 2. 必要な API の有効化（冪等） ----
info "必要な GCP API を有効化しています"
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project "$PROJECT_ID"

# ---- 3. シークレットを Secret Manager へ登録 ----
# .env に値がある項目だけを "<service>-<var名>" という名前で登録する
SECRET_VARS=(
  TELEGRAM_BOT_TOKEN
  TELEGRAM_WEBHOOK_SECRET
  PRIVY_APP_ID
  PRIVY_APP_SECRET
  ANTHROPIC_API_KEY
  DATABASE_URL
  DATABASE_AUTH_TOKEN
)

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format 'value(projectNumber)')
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

SET_SECRETS=()
for var in "${SECRET_VARS[@]}"; do
  value="${!var:-}"
  [[ -n "$value" ]] || continue
  secret_name="${SERVICE_NAME}-$(tr '[:upper:]_' '[:lower:]-' <<<"$var")"
  if ! gcloud secrets describe "$secret_name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    info "シークレット作成: ${secret_name}"
    gcloud secrets create "$secret_name" \
      --replication-policy=automatic --project "$PROJECT_ID"
  fi
  info "シークレット更新: ${secret_name}"
  printf '%s' "$value" |
    gcloud secrets versions add "$secret_name" --data-file=- --project "$PROJECT_ID" >/dev/null
  gcloud secrets add-iam-policy-binding "$secret_name" \
    --member "serviceAccount:${RUNTIME_SA}" \
    --role roles/secretmanager.secretAccessor \
    --project "$PROJECT_ID" >/dev/null
  SET_SECRETS+=("${var}=${secret_name}:latest")
done

# ---- 4. 非シークレットの環境変数 ----
ENV_VARS="BOT_MODE=webhook,DEFAULT_NETWORK=${DEFAULT_NETWORK:-sepolia}"
for var in RPC_URL_MAINNET RPC_URL_SEPOLIA SERA_API_URL_MAINNET SERA_API_URL_SEPOLIA; do
  [[ -n "${!var:-}" ]] && ENV_VARS+=",${var}=${!var}"
done
# 注意: PORT は Cloud Run が注入する予約変数なので渡さない

# ---- 5. デプロイ ----
# max-instances=1 必須: フロー状態（swap/order ドラフト）がインメモリセッションのため
info "Cloud Run へデプロイしています（初回はビルドに数分かかります）"
SECRETS_ARG=$(IFS=,; echo "${SET_SECRETS[*]}")
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --allow-unauthenticated \
  --min-instances 1 \
  --max-instances 1 \
  --set-env-vars "$ENV_VARS" \
  --set-secrets "$SECRETS_ARG"

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)')
info "デプロイ完了: ${SERVICE_URL}"

# ---- 6. Telegram webhook の登録 ----
info "Telegram webhook を登録しています"
PUBLIC_URL="$SERVICE_URL" bun scripts/set-webhook.ts

info "完了！Telegram で bot に /start を送って動作確認してください"
