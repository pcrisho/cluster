#!/usr/bin/env bash
# Generic alert dispatcher for Cluster cron jobs (disk, backup age, health).
# Usage:
#   scripts/ops/alert.sh "<title>" "<message>"
#   echo "<message>" | scripts/ops/alert.sh "<title>"
#   scripts/ops/alert.sh --on-fail "<title>" -- <command...>
set -euo pipefail

json_escape() {
  printf '%s' "$1" | awk '
    BEGIN { ORS=""; first=1 }
    {
      if (!first) printf "\\n"
      first=0
      gsub(/\\/, "\\\\")
      gsub(/"/, "\\\"")
      gsub(/\t/, "\\t")
      gsub(/\r/, "")
      printf "%s", $0
    }
  '
}

send_alert() {
  local title="$1"
  local message="$2"
  local host="${ALERT_HOST:-$(hostname 2>/dev/null || echo unknown)}"
  local now
  now=$(date -u +%FT%TZ)
  local sent=0

  if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
    local fmt="${ALERT_WEBHOOK_FORMAT:-auto}"
    if [ "$fmt" = "auto" ]; then
      case "$ALERT_WEBHOOK_URL" in
        *discord.com/api/webhooks/*|*discordapp.com/api/webhooks/*) fmt="discord" ;;
        *hooks.slack.com/*|*chat.googleapis.com/*) fmt="slack" ;;
        *) fmt="generic" ;;
      esac
    fi

    local j_title j_msg j_host j_now payload
    j_title=$(json_escape "$title")
    j_msg=$(json_escape "$message")
    j_host=$(json_escape "$host")
    j_now=$(json_escape "$now")

    case "$fmt" in
      discord)
        payload="{\"content\":\"**${j_title}** (${j_host})\\n${j_msg}\"}"
        ;;
      slack)
        payload="{\"text\":\"*${j_title}* (${j_host})\\n${j_msg}\"}"
        ;;
      *)
        payload="{\"service\":\"cluster\",\"host\":\"${j_host}\",\"title\":\"${j_title}\",\"message\":\"${j_msg}\",\"text\":\"${j_title} (${j_host}): ${j_msg}\",\"content\":\"${j_title} (${j_host}): ${j_msg}\",\"timestamp\":\"${j_now}\"}"
        ;;
    esac

    local curl_args=(-fsS -m 10 -H "Content-Type: application/json")
    if [ -n "${ALERT_WEBHOOK_HEADER:-}" ]; then
      curl_args+=(-H "$ALERT_WEBHOOK_HEADER")
    fi
    curl "${curl_args[@]}" -d "$payload" "$ALERT_WEBHOOK_URL" > /dev/null
    sent=1
  fi

  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    local tg_chat tg_text tg_payload
    tg_chat=$(json_escape "$TELEGRAM_CHAT_ID")
    tg_text=$(json_escape "${title} (${host})"$'\n'"${message}")
    tg_payload="{\"chat_id\":\"${tg_chat}\",\"text\":\"${tg_text}\"}"
    curl -fsS -m 10 -H "Content-Type: application/json" -d "$tg_payload" \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" > /dev/null
    sent=1
  fi

  if [ "$sent" -eq 0 ]; then
    printf '[alert] %s (%s): %s\n' "$title" "$host" "$message" >&2
  fi
}

if [ "${1:-}" = "--on-fail" ]; then
  shift
  title="${1:-Cluster alert}"
  shift
  if [ "${1:-}" = "--" ]; then shift; fi
  if [ "$#" -eq 0 ]; then
    echo "usage: $0 --on-fail <title> -- <command...>" >&2
    exit 2
  fi
  set +e
  output=$("$@" 2>&1)
  rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    msg=${output:-"command exited with status $rc"}
    send_alert "$title" "$msg" || true
  fi
  exit "$rc"
fi

if [ "$#" -lt 1 ]; then
  echo "usage: $0 <title> [message] | $0 --on-fail <title> -- <command...>" >&2
  exit 2
fi

title="$1"
if [ "$#" -ge 2 ]; then
  message="$2"
else
  message=$(cat)
fi
send_alert "$title" "$message"
