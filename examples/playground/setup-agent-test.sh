#!/bin/sh
# Creates two isolated folders for an agent A/B test:
#   <root>/before/notes  -> plain commander CLI
#   <root>/after/notes   -> same CLI with cli-agent-mode
# Each wrapper keeps its own data (notes.json) and appends every call to calls.log:
#   time <TAB> command <TAB> exit=<code> <TAB> stdout=<bytes>
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
printf '%s\tnotes %s\texit=%s\tstdout=%s\n' "\$(date +%H:%M:%S)" "\$*" "\$code" "\$(wc -c <"\$tmp" | tr -d ' ')" >>"\$DIR/calls.log"
rm -f "\$tmp"
exit \$code
EOF
  chmod +x "$d/notes"
done
echo "ready: $ROOT/before/notes, $ROOT/after/notes"
