#!/bin/bash
cd "$(dirname "$0")"

git fetch origin master --quiet

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/master)

if [ "$LOCAL" != "$REMOTE" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Новый коммит — деплоим..."
  git pull origin master
  npm install --omit=dev
  pm2 restart tournament
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Готово."
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Изменений нет."
fi
