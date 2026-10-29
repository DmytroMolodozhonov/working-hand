#!/bin/sh
# Runs every scene in parallel (one process each) and judges them: tools/voicebench/run.sh [outdir] [extra bench.py args]
OUT=${1:-/tmp/voicebench}; shift 2>/dev/null
mkdir -p "$OUT"
for S in clean chat overlap loud friendspell ship duel; do
  python3 "$(dirname "$0")/bench.py" --scene $S --out "$OUT" "$@" 2>/dev/null &
done
wait
node "$(dirname "$0")/eval.mjs" "$OUT"
