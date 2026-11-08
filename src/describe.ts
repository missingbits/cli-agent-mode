import type { Argument, Command, Option } from 'commander';

// The schema is read by LLM agents, so it is deliberately compact:
// falsy flags and empty lists are omitted, and option details live in commander's
// `flags` string ("-t, --tag <tag>", "--dry-run", "--files <paths...>"), which agents read natively.

export interface ArgumentSchema {
  name: string;
  description?: string;
  /** present only when true */
  required?: true;
  /** present only when true */
  variadic?: true;
  default?: unknown;
  choices?: readonly string[];
}

export interface OptionSchema {
  /** commander flags, e.g. "-t, --tag <tag>" */
  flags: string;
  description?: string;
  /** present only when the option itself must be passed */
  required?: true;
  default?: unknown;
  choices?: readonly string[];
  env?: string;
}

export interface CommandSchema {
  name: string;
  description?: string;
  /** full invocation, e.g. "mycli deploy [options] <env>" */
  usage: string;
  aliases?: string[];
  arguments?: ArgumentSchema[];
  options?: OptionSchema[];
  commands?: CommandSchema[];
}

const clean = <T extends object>(o: T): T =>
  Object.fromEntries(
    Object.entries(o).filter(
      ([, v]) => v !== undefined && v !== '' && v !== false && !(Array.isArray(v) && v.length === 0),
    ),
  ) as T;

function describeArgument(a: Argument): ArgumentSchema {
  return clean({
    name: a.name(),
    description: a.description,
    required: a.required || undefined,
    variadic: a.variadic || undefined,
    default: a.defaultValue,
    choices: a.argChoices,
  } as ArgumentSchema);
}

function describeOption(o: Option): OptionSchema {
  return clean({
    flags: o.flags,
    description: o.description,
    required: o.mandatory || undefined,
    default: o.defaultValue,
    choices: o.argChoices,
    env: o.envVar,
  } as OptionSchema);
}

export function commandPath(cmd: Command): string {
  const parts: string[] = [];
  for (let c: Command | null = cmd; c; c = c.parent) parts.unshift(c.name());
  return parts.join(' ');
}

const isHidden = (c: Command) => (c as unknown as { _hidden?: boolean })._hidden === true;

/** Compact JSON schema of a command and all of its visible subcommands. */
export function describeCommand(cmd: Command): CommandSchema {
  return clean({
    name: cmd.name(),
    description: cmd.description(),
    usage: `${commandPath(cmd)} ${cmd.usage()}`.trim(),
    aliases: cmd.aliases(),
    arguments: cmd.registeredArguments.map(describeArgument),
    options: cmd.options.filter((o) => !o.hidden).map(describeOption),
    commands: cmd.commands.filter((c) => !isHidden(c)).map(describeCommand),
  });
}

/** Resolve `["deploy", "preview"]` to the nested subcommand (by name or alias). */
export function findCommand(root: Command, path: string[]): Command | undefined {
  let cur: Command | undefined = root;
  for (const part of path) {
    cur = cur?.commands.find((c) => c.name() === part || c.aliases().includes(part));
    if (!cur) return undefined;
  }
  return cur;
}
