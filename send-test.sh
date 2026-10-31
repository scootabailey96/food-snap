#!/usr/bin/env bash
# Sends one synthetic submission through the same endpoint/fields the app uses.
# Usage: ./send-test.sh [origin]   (origin must be the URL the app is hosted at, activated in FormSubmit)
set -euo pipefail
ORIGIN="${1:-https://food-snap.example}"
EP=$(grep -o 'https://formsubmit.co/[a-f0-9]\{20,\}' "$(dirname "$0")/config.js")
T=$(mktemp -d)
python3 - "$T" <<'P'
import sys
from PIL import Image, ImageDraw
im=Image.new('RGB',(1600,1200),(210,140,60)); ImageDraw.Draw(im).text((60,60),"food-snap send-test",fill=(255,255,255)); im.save(sys.argv[1]+'/p.jpg',quality=82)
P
ffmpeg -loglevel error -f lavfi -i "sine=frequency=440:duration=2" -c:a libopus -b:a 32k "$T/v.webm"
NOW=$(date -u +%FT%TZ)
curl -sS -m 90 -X POST "$EP" -H "Origin: $ORIGIN" -H "Referer: $ORIGIN/" \
 -F "_subject=[FOOD-SNAP] send-test $(date '+%F %T %Z')" -F _captcha=false -F _template=table \
 -F "timestamp_utc=$NOW" -F "note=Automated send-test (ignore)" -F has_voice_note=yes \
 -F "photo=@$T/p.jpg;type=image/jpeg;filename=food-test.jpg" -F "voice=@$T/v.webm;type=audio/webm;filename=voice-test.webm" | grep -io "submitted successfully\|needs activation\|unable to submit[^<]*" | head -1
echo
