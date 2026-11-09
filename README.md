# cli-agent-mode

[![npm](https://img.shields.io/npm/v/cli-agent-mode)](https://www.npmjs.com/package/cli-agent-mode)
[![CI](https://github.com/missingbits/cli-agent-mode/actions/workflows/ci.yml/badge.svg)](https://github.com/missingbits/cli-agent-mode/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/cli-agent-mode)](LICENSE)

**Make any [commander.js](https://github.com/tj/commander.js) CLI usable by AI agents** (Claude Code, Codex, Cursor, Gemini CLI, opencode, Copilot) **without breaking it for humans.**

If coding agents parse your CLI's text output, guess flags, or read `--help` page by page — this is the fix. In a benchmark, agents needed **26–34% fewer CLI calls** for the same task across Claude Haiku, Claude Sonnet and OpenAI Codex ([details](#benchmark-does-it-actually-help-an-agent)).

Two lines turn your CLI into one that agents can drive reliably:

- **`--json` output envelope** — every command prints exactly one JSON document on stdout: `{"ok":true,"data":...}` or `{"ok":false,"error":{...}}`.
- **Machine-readable errors** — stable `code`, a human `message`, and a `suggestion` the agent can follow literally. Commander usage errors are mapped too (`UNKNOWN_OPTION`, `MISSING_ARGUMENT`, ...).
- **Self-description** — `mycli describe [command]` (and `--help --json`) print the full CLI schema in one call: arguments, option flags, defaults, choices, subcommands. Compact by design (falsy fields and empty lists are omitted) to save agent tokens.
- **Auto-detects agents** — JSON turns on automatically under Claude Code, Codex CLI and opencode (verified), and under `AI_AGENT`, `CURSOR_AGENT`, `GEMINI_CLI`, Copilot and others (precedence: `--json` > `CLI_AGENT_MODE` > auto-detect).
- **Escape hatch** — `CLI_AGENT_MODE=human` forces human output even under an agent, `CLI_AGENT_MODE=json` forces JSON.
- **Stable exit codes** — `0` ok, `1` runtime error, `2` usage error.
- **Clean stdout** — stray `console.log` inside actions is redirected to stderr in JSON mode.

Zero dependencies. ~4 kB gzipped. ESM and CommonJS, Node 22+ (tested on 22, 24, 26), commander 12–15 (tested in CI).

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

## Tell agents about it (AGENTS.md / CLAUDE.md)

Agents are detected automatically, but one line in your project's `AGENTS.md` (or `CLAUDE.md`) saves them a discovery step:

```md
## mycli
`mycli` is agent-friendly: start with `mycli describe --json` to get every command, argument and option.
Every command accepts `--json` and prints one `{"ok":true,"data":...}` / `{"ok":false,"error":{"code","message","suggestion"}}` document on stdout.
On errors, follow `error.suggestion`. Exit codes: 0 ok, 1 runtime error, 2 usage error.
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

Same tiny notes CLI, written twice: plain commander vs. with `cli-agent-mode`. Each agent gets the same task in headless mode: add notes, mark one done, delete a tag (the CLI refuses to delete unfinished notes without `--force`), hit a missing id, report the result. 5 runs per variant, agents from two vendors:

| agent + model | CLI calls: plain → agent-mode | `--help` calls per run | task completed | JSON auto-enabled |
|---|:-:|:-:|:-:|:-:|
| Claude Code + Haiku | 16.2 → **11.2** (−31%) | 4 → **1** | 5/5 → 5/5 | 100% of calls |
| Claude Code + Sonnet | 13.6 → **10.0** (−26%) | 4 → **1** | 5/5 → 5/5 | 100% of calls |
| Codex CLI + GPT (default) | 15.2 → **10.0** (−34%) | 3.8 → **1** | 4/5 → **5/5** | 100% of calls |

- **Fewer calls, same or better results.** Agents learn the whole CLI from a single `--help` (it returns the schema of every command) instead of reading help page by page, and recover from errors using `code` + `suggestion`.
- **More predictable.** With `cli-agent-mode`, Sonnet and Codex used exactly 10 calls in every one of their 10 runs (plain CLI: 13–17).
- **Zero configuration.** Neither agent was told about `--json`; detection switched every call to JSON.
- **Trade-off:** ~1.8× more CLI output (about 250 extra tokens per task here), outweighed by fewer agent round-trips.
- **Not covered yet:** small local models (e.g. via opencode + Ollama) are still being evaluated and are not part of these numbers.

Reproduce (requires the agent CLI): `sh examples/playground/agent-bench.sh claude haiku 5` — see [examples/playground](examples/playground).

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
- commander 15 is ESM-only: TypeScript projects compiled as CommonJS need TypeScript 5.9+ to import it (a commander limitation, not specific to this package).

## License

MIT
