/// <reference path="../types/commander-augment.d.ts" />
import { Command, CommanderError, type HelpConfiguration, type OutputConfiguration } from 'commander';
import { format } from 'node:util';
import { detectAgent } from './detect.js';
import { commandPath, describeCommand, findCommand } from './describe.js';
import { AgentError, EXIT, type Envelope, type ErrorPayload } from './errors.js';

export interface AgentModeOptions {
  /** Switch to JSON automatically when an AI agent is detected (AI_AGENT, CLAUDECODE, CURSOR_AGENT, ...). Default: true. */
  autoDetect?: boolean;
  /** Name of the self-description command, or `false` to skip adding it. Default: "describe". */
  describeCommand?: string | false;
  /** Render action results for humans. Default: strings as-is, everything else as pretty JSON. */
  formatHuman?: (data: unknown, command: Command) => string | undefined;
}

export interface RunOptions {
  /** User arguments (without node and script path). Default: process.argv.slice(2). */
  args?: string[];
  /** Force JSON (`true`) or human (`false`) output, bypassing flag and agent detection. */
  json?: boolean;
  env?: NodeJS.ProcessEnv;
  stdout?: { write(chunk: string): unknown };
  stderr?: { write(chunk: string): unknown };
  /** Set `process.exitCode`. Default: true. */
  setExitCode?: boolean;
}

export interface RunResult {
  mode: 'json' | 'human';
  exitCode: number;
  envelope: Envelope;
}

interface State {
  options: Required<Omit<AgentModeOptions, 'formatHuman'>> & Pick<AgentModeOptions, 'formatHuman'>;
  result?: { value: unknown; command: Command };
  /** command currently being parsed (for usage-error hints) */
  current?: Command;
}

const states = new WeakMap<Command, State>();
const hooked = new WeakSet<Command>();


const rootOf = (cmd: Command): Command => {
  let c = cmd;
  while (c.parent) c = c.parent;
  return c;
};

/** Make every `.action()` handler's return value available as the command result. */
function patch<T extends Command>(cmd: T): T {
  const proto = Object.getPrototypeOf(cmd) as Command;
  (cmd as Command).action = function (this: Command, fn: (...args: any[]) => unknown) {
    return proto.action.call(this, async function (this: Command, ...args: any[]) {
      const value = await fn.apply(this, args);
      const state = states.get(rootOf(this));
      if (state) state.result = { value, command: this };
    });
  };
  cmd.createCommand = (name?: string) => patch(proto.createCommand.call(cmd, name));
  const addCommand = cmd.addCommand;
  (cmd as Command).addCommand = function (this: Command, sub: Command, opts?: any) {
    walk(sub, patch);
    return addCommand.call(this, sub, opts);
  };
  return cmd;
}

function walk(cmd: Command, fn: (c: Command) => void) {
  fn(cmd);
  for (const sub of cmd.commands) walk(sub, fn);
}

/**
 * Turn a commander program into an agent-friendly CLI.
 * Call it right after creating the program, before defining subcommands.
 *
 * @example
 * const program = agentMode(new Command('mycli'));
 * program.command('deploy <env>').action(async (env) => ({ url: `https://${env}.example.com` }));
 * await run(program);
 */
export function agentMode<T extends Command>(program: T, options: AgentModeOptions = {}): T {
  const state: State = {
    options: {
      autoDetect: options.autoDetect ?? true,
      describeCommand: options.describeCommand ?? 'describe',
      formatHuman: options.formatHuman,
    },
  };
  states.set(program, state);
  walk(program, patch);

  program.option('--json', 'print one JSON envelope on stdout (auto-on for AI agents)');

  const name = state.options.describeCommand;
  if (name) {
    program
      .command(`${name} [command...]`)
      .description('print the CLI schema as JSON')
      .action((path: string[] = []) => {
        const target = findCommand(program, path);
        if (!target) {
          throw new AgentError('UNKNOWN_COMMAND', `Unknown command: ${path.join(' ')}`, {
            suggestion: `Run "${program.name()} ${name}" to list all commands.`,
            exitCode: EXIT.USAGE,
          });
        }
        return describeCommand(target);
      });
  }
  return program;
}

const USAGE_CODES: Record<string, string> = {
  'commander.unknownOption': 'UNKNOWN_OPTION',
  'commander.unknownCommand': 'UNKNOWN_COMMAND',
  'commander.missingArgument': 'MISSING_ARGUMENT',
  'commander.optionMissingArgument': 'MISSING_OPTION_VALUE',
  'commander.missingMandatoryOptionValue': 'MISSING_REQUIRED_OPTION',
  'commander.invalidArgument': 'INVALID_ARGUMENT',
  'commander.excessArguments': 'EXCESS_ARGUMENTS',
  'commander.conflictingOption': 'CONFLICTING_OPTIONS',
  'commander.help': 'MISSING_COMMAND',
};

function extractJsonFlag(args: string[]): { args: string[]; json: boolean } {
  const end = args.indexOf('--');
  const head = end === -1 ? args : args.slice(0, end);
  const tail = end === -1 ? [] : args.slice(end);
  const json = head.includes('--json');
  return { args: [...head.filter((a) => a !== '--json'), ...tail], json };
}

const defaultHuman = (data: unknown) =>
  data === undefined || data === null ? undefined : typeof data === 'string' ? data : JSON.stringify(data, null, 2);

/** Parse arguments, run the matching action and print the result or error in the right format. */
export async function run(program: Command, runOptions: RunOptions = {}): Promise<RunResult> {
  const state = states.get(program);
  if (!state) throw new Error('cli-agent-mode: call agentMode(program) before run(program)');
  state.result = undefined;

  const env = runOptions.env ?? process.env;
  const stdout = runOptions.stdout ?? process.stdout;
  const stderr = runOptions.stderr ?? process.stderr;
  const extracted = extractJsonFlag(runOptions.args ?? process.argv.slice(2));
  const forced = env.CLI_AGENT_MODE === 'json' ? true : env.CLI_AGENT_MODE === 'human' ? false : undefined;
  const json =
    runOptions.json ??
    (extracted.json || (forced ?? (state.options.autoDetect && detectAgent(env) !== undefined)));
  const mode = json ? 'json' : 'human';

  // Route commander's own output. Track the command being parsed via the preSubcommand hook,
  // so usage errors point to the right subcommand. (Commander <=13 shares one output config
  // object between commands, so per-command closures there would all see the last command.)
  let outBuf = '';
  state.current = program;
  const restore: Array<() => void> = [];
  walk(program, (cmd) => {
    if (!hooked.has(cmd)) {
      hooked.add(cmd);
      cmd.hook('preSubcommand', (_parent, sub) => {
        const s = states.get(rootOf(sub));
        if (s) s.current = sub;
      });
    }
    // Snapshot copies: with a shared config object a reference would be mutated below.
    const prevOutput = { ...(cmd.configureOutput() as OutputConfiguration) };
    const prevHelp = { ...(cmd.configureHelp() as HelpConfiguration) };
    restore.push(() => {
      cmd.configureOutput(prevOutput);
      cmd.configureHelp(prevHelp);
    });
    cmd.exitOverride();
    cmd.configureOutput({
      ...prevOutput,
      writeOut: (s) => (json ? (outBuf += s) : stdout.write(s)),
      writeErr: (s) => (json ? undefined : stderr.write(s)),
      outputError: (s, write) => {
        if (!json) write(s);
      },
    });
    if (json) {
      cmd.configureHelp({
        ...prevHelp,
        formatHelp: (c) => JSON.stringify({ ok: true, data: describeCommand(c) }) + '\n',
      });
    }
  });

  // In JSON mode stdout is reserved for the envelope: send stray console output to stderr.
  const consoleKeys = ['log', 'info', 'debug'] as const;
  const savedConsole = consoleKeys.map((k) => console[k]);
  if (json) for (const k of consoleKeys) console[k] = (...a: unknown[]) => void stderr.write(format(...a) + '\n');

  let envelope: Envelope;
  let exitCode: number = EXIT.OK;
  let printed = false;
  try {
    await program.parseAsync(extracted.args, { from: 'user' });
    const result = state.result as State['result']; // set inside the action wrapper
    const value = result?.value;
    envelope = { ok: true, data: value ?? null };
    if (!json) {
      const text = (state.options.formatHuman ?? defaultHuman)(value, result?.command ?? program);
      if (text !== undefined) stdout.write(text + '\n');
      printed = true;
    }
  } catch (err) {
    if (err instanceof CommanderError && (err.code === 'commander.helpDisplayed' || (err.code === 'commander.help' && err.exitCode === 0))) {
      // Help was rendered by commander (as JSON schema in JSON mode).
      if (json) stdout.write(outBuf);
      return finish({ ok: true, data: null }, EXIT.OK, true);
    }
    if (err instanceof CommanderError && err.code === 'commander.version') {
      envelope = { ok: true, data: { version: outBuf.trim() || program.version() } };
      exitCode = EXIT.OK;
      if (!json) printed = true; // commander already printed it
    } else {
      const { payload, code } = toPayload(err, program, state.current ?? program, state.options.describeCommand);
      envelope = { ok: false, error: payload };
      exitCode = code;
      if (!json) {
        const alreadyPrinted = err instanceof CommanderError;
        if (!alreadyPrinted) stderr.write(`error: ${payload.message}\n`);
        if (payload.suggestion) stderr.write(`hint: ${payload.suggestion}\n`);
        printed = true;
      }
    }
  } finally {
    consoleKeys.forEach((k, i) => (console[k] = savedConsole[i]!));
    restore.forEach((r) => r());
  }
  return finish(envelope, exitCode, printed);

  function finish(env: Envelope, code: number, done: boolean): RunResult {
    if (json && !done) stdout.write(JSON.stringify(env) + '\n');
    if (runOptions.setExitCode ?? true) process.exitCode = code;
    return { mode, exitCode: code, envelope: env };
  }
}

function toPayload(
  err: unknown,
  root: Command,
  at: Command,
  describeName: string | false,
): { payload: ErrorPayload; code: number } {
  if (err instanceof AgentError) {
    return {
      payload: strip({ code: err.code, message: err.message, suggestion: err.suggestion, details: err.details }),
      code: err.exitCode,
    };
  }
  if (err instanceof CommanderError) {
    const sub = commandPath(at).split(' ').slice(1).join(' ');
    const suggestion = describeName
      ? `Run "${[root.name(), describeName, sub].filter(Boolean).join(' ')}" to see accepted arguments and options.`
      : `Run "${commandPath(at)} --help" to see usage.`;
    const message =
      err.code === 'commander.help' ? 'A subcommand is required.' : err.message.replace(/^error:\s*/, '');
    return {
      payload: { code: USAGE_CODES[err.code] ?? 'USAGE_ERROR', message, suggestion },
      code: EXIT.USAGE,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { payload: { code: 'INTERNAL_ERROR', message }, code: EXIT.ERROR };
}

const strip = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
