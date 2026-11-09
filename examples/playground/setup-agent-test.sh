#!/bin/sh
# Creates two isolated folders for an agent A/B test:
#   <root>/before/notes  -> plain commander CLI
#   <root>/after/notes   -> same CLI with cli-agent-mode
# Each wrapper keeps its own data (notes.json) and appends every call to calls.log:
#   time <TAB> command <TAB> exit=<code> <TAB> stdout=<bytes> <TAB> json=<yes|no> <TAB> env=<agent env vars seen>
# `env` lists which agent-identifying variables the calling agent set (checks auto-detection).
# Re-running the script resets both folders.
set -e
ROOT="${1:-$HOME/agent-test}"
BIN="$(cd "$(dirname "$0")" && pwd)/bin"

for v in before after; do
  d="$ROOT/$v"
  mkdir -p "$d"
  rm -f "$d/notes.json" "$d/calls.log"
  cat > "$d/notes" <<EOF
#!/bin/sh
DIR="\$(cd "\$(dirname "\$0")" && pwd)"
export NOTES_FILE="\$DIR/notes.json"
tmp="\$(mktemp)"
"$BIN/notes-$v" "\$@" >"\$tmp"
code=\$?
cat "\$tmp"
json=no; head -c 6 "\$tmp" | grep -q '^{"ok"' && json=yes
seen=""
for n in AI_AGENT CLAUDECODE CLAUDE_CODE CURSOR_AGENT GEMINI_CLI CODEX_SANDBOX CODEX_CI CODEX_THREAD_ID OPENCODE OPENCODE_CLIENT COPILOT_MODEL; do
  eval "val=\\\${\$n:-}"; [ -n "\$val" ] && seen="\$seen\$n,"
done
printf '%s\tnotes %s\texit=%s\tstdout=%s\tjson=%s\tenv=%s\n' "\$(date +%H:%M:%S)" "\$*" "\$code" "\$(wc -c <"\$tmp" | tr -d ' ')" "\$json" "\${seen%,}" >>"\$DIR/calls.log"
rm -f "\$tmp"
exit \$code
EOF
  chmod +x "$d/notes"
done
echo "ready: $ROOT/before/notes, $ROOT/after/notes"
