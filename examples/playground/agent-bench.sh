#!/bin/sh
# A/B benchmark: plain commander CLI vs the same CLI with cli-agent-mode, driven by a coding agent.
#
#   agent-bench.sh <agent> <model> [runs=5] [out=~/agent-bench/<timestamp>-<agent>-<model>]
#   agent-bench.sh --summary <out>
#
# agents:
#   claude        Claude Code headless (claude -p), only ./notes allowed           model: haiku | sonnet | opus
#   codex         Codex CLI (codex exec), workspace-write sandbox                  model: default | <openai model>
#   codex-ollama  Codex CLI with a local Ollama model (--oss)                      model: qwen3.5:9b, ...
#   gemini        Gemini CLI headless (gemini -p), yolo inside macOS sandbox       model: default | <gemini model>
#   opencode      opencode run with a local Ollama model, only ./notes allowed      model: qwen3.5:9b, ...
#
# Each run gets fresh folders. Results: <out>/run-N/{before,after}/{answer.txt,stderr.txt,calls.log,notes.json}
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"

summary() {
  OUT="$1"
  TOTALS=""
  printf '\n%-6s %-7s %-8s %-7s %-6s %-7s %-7s %-6s %s\n' run variant success report calls failed bytes json agent-env
  for v in before after; do
    ok=0; n=0; calls=0; bytes=0; failed=0; rep=0
    for d in "$OUT"/run-*/"$v"; do
      [ -d "$d" ] || continue
      n=$((n + 1))
      if [ ! -s "$d/calls.log" ]; then
        printf '%-6s %-7s %-8s (agent ran no ./notes commands, see answer.txt / stderr.txt)\n' "$(basename "$(dirname "$d")")" "$v" "no-calls"
        continue
      fi
      if jq -e '.notes | length == 1 and .[0].id == 2 and .[0].done' "$d/notes.json" >/dev/null 2>&1; then s=yes; ok=$((ok + 1)); else s=NO; fi
      # the final answer must mention note 99 and the remaining note
      if grep -q '99' "$d/answer.txt" 2>/dev/null && grep -qi 'fix CI' "$d/answer.txt" 2>/dev/null; then r=yes; rep=$((rep + 1)); else r=NO; fi
      c=$(wc -l <"$d/calls.log" | tr -d ' ')
      f=$(grep -vc 'exit=0' "$d/calls.log" || true)
      b=$(awk -F'\t' '{split($4,a,"="); t+=a[2]} END {print t+0}' "$d/calls.log")
      j=$(grep -c 'json=yes' "$d/calls.log" || true)
      e=$(awk -F'\t' '{print $6}' "$d/calls.log" | sort -u | tr '\n' ' ')
      calls=$((calls + c)); bytes=$((bytes + b)); failed=$((failed + f))
      printf '%-6s %-7s %-8s %-7s %-6s %-7s %-7s %-6s %s\n' "$(basename "$(dirname "$d")")" "$v" "$s" "$r" "$c" "$f" "$b" "$j/$c" "$e"
    done
    [ "$n" -gt 0 ] && TOTALS="$TOTALS$(printf '%-7s success %s/%s  report %s/%s  avg calls %s  avg failed %s  avg bytes %s' "$v" "$ok" "$n" "$rep" "$n" \
      "$(echo "scale=1; $calls / $n" | bc)" "$(echo "scale=1; $failed / $n" | bc)" "$(echo "$bytes / $n" | bc)")
"
  done
  printf '\n%s' "$TOTALS"
  echo "details: $OUT/run-*/<variant>/{answer.txt,stderr.txt,calls.log,notes.json}"
}

if [ "$1" = "--summary" ]; then summary "$2"; exit 0; fi

AGENT="${1:?agent required: claude | codex | codex-ollama | gemini | opencode}"
MODEL="${2:?model required (use 'default' for the agent default)}"
RUNS="${3:-5}"
OUT="${4:-$HOME/agent-bench/$(date +%Y%m%d-%H%M%S)-$AGENT-$(echo "$MODEL" | tr ':/' '--')}"
PROMPT='Use the command-line tool ./notes (a notes manager). Do not read its source code.
1. Add three notes: "buy milk" tagged home, "fix CI" tagged work, "call mom" tagged home.
2. Mark "fix CI" as done.
3. Delete every note tagged home.
4. Try to mark note 99 as done and tell me what happened.
5. Report which notes remain, as a list of ids and titles.'

run_agent() { # runs inside the variant folder (a subshell)
  # drop agent markers inherited from the shell that started the benchmark,
  # so calls.log shows only what the benchmarked agent itself sets
  unset AI_AGENT CLAUDECODE CLAUDE_CODE CURSOR_AGENT GEMINI_CLI CODEX_SANDBOX CODEX_CI CODEX_THREAD_ID \
    OPENCODE OPENCODE_CLIENT COPILOT_MODEL
  case "$AGENT" in
    claude)
      claude -p "$PROMPT" --model "$MODEL" --allowedTools "Bash(./notes:*)" "Bash(./notes *)" \
        --strict-mcp-config --no-session-persistence ;;
    codex)
      if [ "$MODEL" = default ]; then set --; else set -- -m "$MODEL"; fi
      codex exec "$@" --skip-git-repo-check --ephemeral -s workspace-write -C "$PWD" "$PROMPT" ;;
    codex-ollama)
      codex exec --oss --local-provider ollama -m "$MODEL" --skip-git-repo-check --ephemeral \
        -s workspace-write -C "$PWD" "$PROMPT" ;;
    gemini)
      if [ "$MODEL" = default ]; then set --; else set -- -m "$MODEL"; fi
      # --skip-trust: run folders are fresh, Gemini CLI refuses untrusted folders in headless mode
      gemini "$@" --approval-mode yolo --sandbox --skip-trust -p "$PROMPT" ;;
    opencode)
      cat >opencode.json <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama",
      "options": { "baseURL": "http://localhost:11434/v1" },
      "models": { "$MODEL": { "name": "$MODEL", "tools": true } }
    }
  },
  "permission": { "edit": "deny", "webfetch": "deny", "bash": { "*": "deny", "./notes *": "allow", "./notes": "allow" } }
}
EOF
      opencode run -m "ollama/$MODEL" --dir "$PWD" "$PROMPT" ;;
    *) echo "unknown agent: $AGENT" >&2; exit 2 ;;
  esac
}

mkdir -p "$OUT"
echo "agent=$AGENT model=$MODEL runs=$RUNS out=$OUT"
i=1
while [ "$i" -le "$RUNS" ]; do
  sh "$HERE/setup-agent-test.sh" "$OUT/run-$i" >/dev/null
  # local models share one GPU: run variants one after another; cloud agents run in parallel
  case "$AGENT" in codex-ollama|opencode) PARALLEL=no ;; *) PARALLEL=yes ;; esac
  for v in before after; do
    if [ "$PARALLEL" = yes ]; then
      (cd "$OUT/run-$i/$v" && run_agent </dev/null >answer.txt 2>stderr.txt || echo "agent exit $?" >>stderr.txt) &
    else
      (cd "$OUT/run-$i/$v" && run_agent </dev/null >answer.txt 2>stderr.txt || echo "agent exit $?" >>stderr.txt)
    fi
  done
  wait
  echo "run $i/$RUNS done"
  i=$((i + 1))
done
summary "$OUT"
