#!/usr/bin/env bash
# Sekali jalan: masukkan Google Client ID + MongoDB ke Vercel lewat CLI.
#
# Pakai (dari dalam folder kelasnime):
#   chmod +x vercel-env.sh
#   ./vercel-env.sh "1234567890-abc.apps.googleusercontent.com" \
#                   "mongodb+srv://kelasnime:PASSWORD@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority" \
#                   kelasnime
#
# Argumen ke-3 (nama database) opsional, default: kelasnime
# Sudah punya project di Vercel? Jalankan dulu:  vercel link

set -euo pipefail

CLIENT_ID="${1:-}"
MONGO_URI="${2:-}"
DB_NAME="${3:-kelasnime}"

if [ -z "$CLIENT_ID" ] || [ -z "$MONGO_URI" ]; then
  echo "Cara pakai:"
  echo "  ./vercel-env.sh <GOOGLE_CLIENT_ID> <MONGODB_URI> [MONGODB_DB]"
  exit 1
fi

if ! command -v vercel >/dev/null 2>&1; then
  echo "Vercel CLI belum ada. Install dulu:  npm i -g vercel   lalu:  vercel login"
  exit 1
fi

add() { # add KEY VALUE
  echo "→ menyimpan $1"
  printf '%s' "$2" | vercel env add "$1" production >/dev/null
}

add GOOGLE_CLIENT_ID "$CLIENT_ID"
add MONGODB_URI      "$MONGO_URI"
add MONGODB_DB       "$DB_NAME"
add DEMO_LOGIN       "0"

echo
echo "Selesai. Sekarang deploy ulang supaya env terbaca:"
echo "  vercel --prod"
