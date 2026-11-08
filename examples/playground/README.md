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

Requires [Claude Code](https://docs.claude.com/en/docs/claude-code). Runs both variants N times in fresh folders,
lets the agent execute only `./notes`, logs every call and prints a summary:

```bash
sh examples/playground/agent-bench.sh 5 haiku        # runs, model
```

Results land in `~/agent-bench/<timestamp>-<model>/run-*/<variant>/` (`answer.txt`, `calls.log`, `notes.json`).

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
