#!/usr/bin/env bash
set -euo pipefail

required_tools=(aws docker jq curl)
for tool in "${required_tools[@]}"; do
  command -v "$tool" >/dev/null || { echo "Missing required tool: $tool" >&2; exit 2; }
done

: "${ORBIT_STAGING_SECRET_ID:?Set ORBIT_STAGING_SECRET_ID to an AWS Secrets Manager JSON secret}"
: "${STAGING_DOMAIN:?Set STAGING_DOMAIN to the DNS name pointing at this host}"

secret_json="$(aws secretsmanager get-secret-value \
  --secret-id "$ORBIT_STAGING_SECRET_ID" \
  --query SecretString \
  --output text)"

while IFS= read -r key; do
  value="$(jq -er --arg key "$key" '.[$key]' <<<"$secret_json")"
  export "$key=$value"
done < <(jq -r 'keys[]' <<<"$secret_json")

required_secrets=(
  DATABASE_URL REDIS_URL ALLOWED_ORIGINS JWT_ACCESS_SECRET JWT_REFRESH_SECRET
  FIELD_ENCRYPTION_KEY EXPORT_SIGNING_SECRET RESEND_API_KEY RESEND_FROM_EMAIL
  TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_FROM_PHONE SENTRY_DSN
)
for key in "${required_secrets[@]}"; do
  test -n "${!key:-}" || { echo "Secret JSON is missing $key" >&2; exit 2; }
done

[[ "$DATABASE_URL" == *"sslmode=require"* ]] || {
  echo "DATABASE_URL must require TLS with sslmode=require" >&2
  exit 2
}
[[ "$REDIS_URL" == rediss://* ]] || {
  echo "REDIS_URL must use TLS (rediss://)" >&2
  exit 2
}

compose=(docker compose -f infra/staging/docker-compose.yml)
"${compose[@]}" build api worker migrate
"${compose[@]}" run --rm migrate
"${compose[@]}" up -d api worker caddy

for attempt in {1..24}; do
  if curl --fail --silent --show-error "https://$STAGING_DOMAIN/ready" >/dev/null; then
    echo "ORBIT staging is ready at https://$STAGING_DOMAIN"
    exit 0
  fi
  sleep 5
done

echo "Staging did not become ready within two minutes." >&2
"${compose[@]}" ps
exit 1
