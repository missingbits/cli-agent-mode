# cli-agent-mode

**Make any [commander.js](https://github.com/tj/commander.js) CLI usable by AI agents** (Claude Code, Cursor, Codex, Gemini CLI, Copilot) **without breaking it for humans.**

Two lines turn your CLI into one that agents can drive reliably:

- **`--json` output envelope** — every command prints exactly one JSON document on stdout: `{"ok":true,"data":...}` or `{"ok":false,"error":{...}}`.
- **Machine-readable errors** — stable `code`, a human `message`, and a `suggestion` the agent can follow literally. Commander usage errors are mapped too (`UNKNOWN_OPTION`, `MISSING_ARGUMENT`, ...).
- **Self-description** — `mycli describe [command]` (and `--help --json`) print the full CLI schema in one call: arguments, option flags, defaults, choices, subcommands. Compact by design (falsy fields and empty lists are omitted) to save agent tokens.
- **Auto-detects agents** — JSON turns on automatically under `AI_AGENT`, `CLAUDECODE`, `CURSOR_AGENT`, `GEMINI_CLI`, `CODEX_SANDBOX`, ... (precedence: `--json` > `CLI_AGENT_MODE` > auto-detect)
- **Escape hatch** — `CLI_AGENT_MODE=human` forces human output even under an agent, `CLI_AGENT_MODE=json` forces JSON.
- **Stable exit codes** — `0` ok, `1` runtime error, `2` usage error.
- **Clean stdout** — stray `console.log` inside actions is redirected to stderr in JSON mode.

Zero dependencies. ~4 kB gzipped. ESM and CommonJS, Node 20+, commander 12+.

```bash
npm i cli-agent-mode
```

## Usage

```ts
import { Command } from 'commander';
import { AgentError, agentMode, run } from 'cli-agent-mode';

const program = agentMode(new Command('deployctl')).version('1.0.0'); // 1. wrap the program

program
  .command('deploy')
  .argument('<env>', 'environment name')
  .option('--dry-run', 'show the plan without deploying')
  .action(async (env, opts) => {
    if (!['staging', 'prod'].includes(env)) {
      throw new AgentError('ENV_NOT_FOUND', `Unknown environment "${env}"`, {
        suggestion: 'Use one of: staging, prod.',
      });
    }
    return { env, url: `https://${env}.example.com` }; // return data instead of printing it
  });

await run(program); // 2. replace program.parseAsync()
```

What an agent sees:

```console
$ deployctl deploy prod --json
{"ok":true,"data":{"env":"prod","url":"https://prod.example.com"}}

$ deployctl deploy mars --json          # exit code 1
{"ok":false,"error":{"code":"ENV_NOT_FOUND","message":"Unknown environment \"mars\"","suggestion":"Use one of: staging, prod."}}

$ deployctl deploy --json               # exit code 2
{"ok":false,"error":{"code":"MISSING_ARGUMENT","message":"missing required argument 'env'","suggestion":"Run \"deployctl describe deploy\" to see accepted arguments and options."}}

$ deployctl describe deploy --json
{"ok":true,"data":{"name":"deploy","description":"Deploy an environment","usage":"deployctl deploy [options] <env>","arguments":[{"name":"env","description":"environment name","required":true}],"options":[{"flags":"--dry-run","description":"show the plan without deploying"}]}}
```

What a human sees (same CLI, no agent detected):

```console
$ deployctl deploy mars
error: Unknown environment "mars"
hint: Use one of: staging, prod.
```

## API

### `agentMode(program, options?)`

Call right after `new Command()`, **before** defining subcommands. Adds the `--json` flag and the `describe` command, and lets `.action()` handlers return a result.

| option | default | |
|---|---|---|
| `autoDetect` | `true` | enable JSON when an AI agent is detected |
| `describeCommand` | `'describe'` | name of the schema command, `false` to disable |
| `formatHuman` | strings as-is, other values as pretty JSON | `(data, command) => string \| undefined` |

### `run(program, options?)` → `Promise<{ mode, exitCode, envelope }>`

Parses `process.argv`, runs the action, prints the result/error, sets `process.exitCode`. For tests pass `args`, `env`, `stdout`, `stderr`, `json`, `setExitCode: false`.

### `new AgentError(code, message, { suggestion?, details?, exitCode? })`

Throw it from an action for a structured error. Anything else thrown becomes `INTERNAL_ERROR`.

### `describeCommand(cmd)`, `detectAgent(env?)`

Lower-level helpers: the schema generator and the agent detector.

### Error codes from commander

`UNKNOWN_OPTION`, `UNKNOWN_COMMAND`, `MISSING_ARGUMENT`, `MISSING_OPTION_VALUE`, `MISSING_REQUIRED_OPTION`, `INVALID_ARGUMENT`, `EXCESS_ARGUMENTS`, `CONFLICTING_OPTIONS`, `MISSING_COMMAND`, `USAGE_ERROR`.

## Benchmark: does it actually help an agent?

Same tiny notes CLI, written twice: plain commander vs. with `cli-agent-mode`. Claude Code (headless, Claude Haiku) gets the same task: add notes, mark one done, delete a tag (the CLI refuses to delete unfinished notes without `--force`), hit a missing id, report the result. 6 runs per variant:

| | plain commander | cli-agent-mode |
|---|:-:|:-:|
| task completed | 6/6 | 6/6 |
| CLI calls (avg, range) | 17.3 (16–19) | **11.3 (9–12)** |
| `--help` calls per run | 4 | **1** |
| failed calls (avg) | 3.0 | **1.8** |
| CLI output (avg bytes) | ~1100 | ~2000 |

**−35% CLI calls with the same success rate.** The agent learns the whole CLI from one `--help` (which returns the schema of every command) instead of reading help page by page, and recovers from errors using `code` + `suggestion`. The trade-off is ~1.8× more output (≈250 tokens per task here).

Reproduce: [`examples/playground/agent-bench.sh`](examples/playground/agent-bench.sh) `5 haiku` (requires Claude Code).

## Why not ...

| | `--json` from return values | structured errors + suggestion | schema command | agent auto-detect |
|---|:-:|:-:|:-:|:-:|
| plain commander | ✗ | ✗ | ✗ | ✗ |
| oclif (`enableJsonFlag`) | ✓ | partial | ✗ | ✗ |
| hand-rolled `if (opts.json)` | per command | usually ✗ | ✗ | ✗ |
| **cli-agent-mode** | ✓ | ✓ | ✓ | ✓ |

If you are already on oclif, you have `--json`. If you are on commander — the most used Node CLI framework — this is the missing piece.

## Limitations

- Subcommands must be created with `program.command()` (or added via `addCommand()` *before* their `.action()` is set) so return values can be captured.
- `--json` is reserved: it is removed from argv before parsing (except after `--`).
- In JSON mode `console.log/info/debug` are redirected to stderr, but direct `process.stdout.write` calls inside actions are not — return data instead.
- Typed `@commander-js/extra-typings` is not supported yet.

## License

MIT
