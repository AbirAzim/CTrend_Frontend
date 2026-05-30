#!/usr/bin/env bash
# One-time: enlarge swap so Android/Gradle builds do not OOM-kill Chromium/Cursor.
# Requires sudo. Default target: 8G swapfile at /swapfile
set -euo pipefail

SIZE="${1:-8G}"
FILE="${2:-/swapfile}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo: sudo $0 [$SIZE] [$FILE]"
  exit 1
fi

if swapon --show | grep -q "$FILE"; then
  swapoff "$FILE" || true
fi

fallocate -l "$SIZE" "$FILE" || dd if=/dev/zero of="$FILE" bs=1M count=$(( ${SIZE%G} * 1024 )) status=progress
chmod 600 "$FILE"
mkswap "$FILE"
swapon "$FILE"

grep -q "^$FILE " /etc/fstab 2>/dev/null || echo "$FILE none swap sw 0 0" >> /etc/fstab

echo "Swap after resize:"
swapon --show
free -h
