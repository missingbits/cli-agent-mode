#!/bin/sh
# A/B benchmark: plain commander CLI vs the same CLI with cli-agent-mode, driven by Claude Code headless.
#   usage: agent-bench.sh [runs=5] [model=haiku] [out=~/agent-bench/<timestamp>]
#   summary only: agent-bench.sh --summary <out>
# Each run gets fresh folders; the agent may only execute ./notes.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"

summary() {
  OUT="$1"
  printf '\n%-6s %-7s %-8s %-6s %-7s %-7s\n' run variant success calls failed bytes
  for v in before after; do
    ok=0; n=0; calls=0; bytes=0; failed=0
    for d in "$OUT"/run-*/"$v"; do
      [ -f "$d/calls.log" ] || { n=$((n + 1)); printf '%-6s %-7s %-8s\n' "$(basename "$(dirname "$d")")" "$v" "no-calls"; continue; }
      n=$((n + 1))
      if jq -e '.notes | length == 1 and .[0].id == 2 and .[0].done' "$d/notes.json" >/dev/null 2>&1; then s=yes; ok=$((ok + 1)); else s=NO; fi
      c=$(wc -l <"$d/calls.log" | tr -d ' ')
      f=$(grep -vc 'exit=0' "$d/calls.log" || true)
      b=$(awk -F'\t' '{split($4,a,"="); t+=a[2]} END {print t+0}' "$d/calls.log")
      calls=$((calls + c)); bytes=$((bytes + b)); failed=$((failed + f))
      printf '%-6s %-7s %-8s %-6s %-7s %-7s\n' "$(basename "$(dirname "$d")")" "$v" "$s" "$c" "$f" "$b"
    done
    [ "$n" -gt 0 ] && TOTALS="$TOTALS$(printf '%-7s success %s/%s  avg calls %s  avg failed %s  avg bytes %s' "$v" "$ok" "$n" \
      "$(echo "scale=1; $calls / $n" | bc)" "$(echo "scale=1; $failed / $n" | bc)" "$(echo "$bytes / $n" | bc)")
"
  done
  printf '\n%s' "$TOTALS"
  echo "details: $OUT/run-*/<variant>/{answer.txt,calls.log,notes.json}"
}

if [ "$1" = "--summary" ]; then summary "$2"; exit 0; fi

RUNS="${1:-5}"
MODEL="${2:-haiku}"
OUT="${3:-$HOME/agent-bench/$(date +%Y%m%d-%H%M%S)-$MODEL}"
PROMPT='Use the command-line tool ./notes (a notes manager). Do not read its source code.
1. Add three notes: "buy milk" tagged home, "fix CI" tagged work, "call mom" tagged home.
2. Mark "fix CI" as done.
3. Delete every note tagged home.
4. Try to mark note 99 as done and tell me what happened.
5. Report which notes remain, as a list of ids and titles.'

mkdir -p "$OUT"
echo "runs=$RUNS model=$MODEL out=$OUT"
i=1
while [ "$i" -le "$RUNS" ]; do
  sh "$HERE/setup-agent-test.sh" "$OUT/run-$i" >/dev/null
  for v in before after; do
    (cd "$OUT/run-$i/$v" && claude -p "$PROMPT" --model "$MODEL" \
      --allowedTools "Bash(./notes:*)" "Bash(./notes *)" \
      --strict-mcp-config --no-session-persistence >answer.txt 2>stderr.txt || echo "claude exit $?" >>stderr.txt) &
  done
  wait
  echo "run $i/$RUNS done"
  i=$((i + 1))
done
summary "$OUT"
