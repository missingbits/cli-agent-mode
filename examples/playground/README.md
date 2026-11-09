# Agent A/B playground

The same tiny notes CLI written twice:

- [`before.ts`](before.ts) — plain commander: text output, `console.error` + `process.exit(1)`.
- [`after.ts`](after.ts) — the same CLI with `cli-agent-mode`: actions return data, errors are `AgentError`s.

Run them by hand (from the package root, after `npm install && npm run build`):

```bash
examples/playground/bin/notes-before add "buy milk" -t home
examples/playground/bin/notes-after  add "buy milk" -t home --json
```

## Benchmark with a real agent

Runs both variants N times in fresh folders with a headless coding agent, lets it execute only `./notes`,
logs every call (exit code, output size, whether JSON mode was on, which agent env vars were set) and prints a summary:

```bash
sh examples/playground/agent-bench.sh claude haiku 5          # Claude Code: haiku | sonnet | opus
sh examples/playground/agent-bench.sh codex default 5         # Codex CLI (OpenAI)
sh examples/playground/agent-bench.sh opencode qwen3.5:9b 5   # opencode + local Ollama model
sh examples/playground/agent-bench.sh gemini default 5        # Gemini CLI (needs GEMINI_API_KEY)
```

Results land in `~/agent-bench/<timestamp>-<agent>-<model>/run-*/<variant>/` (`answer.txt`, `stderr.txt`, `calls.log`, `notes.json`).
Re-print a summary with `sh examples/playground/agent-bench.sh --summary <dir>`.

For an interactive session instead, create the two folders and start an agent in each:

```bash
sh examples/playground/setup-agent-test.sh           # ~/agent-test/{before,after}/notes
cd ~/agent-test/before && claude                     # and in another terminal: cd ~/agent-test/after && claude
```

Prompt used in the benchmark:

```
Use the command-line tool ./notes (a notes manager). Do not read its source code.
1. Add three notes: "buy milk" tagged home, "fix CI" tagged work, "call mom" tagged home.
2. Mark "fix CI" as done.
3. Delete every note tagged home.
4. Try to mark note 99 as done and tell me what happened.
5. Report which notes remain, as a list of ids and titles.
```
