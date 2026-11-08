import type { Argument, Command, Option } from 'commander';

export interface ArgumentSchema {
  name: string;
  description?: string;
  required: boolean;
  variadic: boolean;
  default?: unknown;
  choices?: readonly string[];
}

export interface OptionSchema {
  /** camelCase key as it appears in the parsed options object */
  name: string;
  flags: string;
  long?: string;
  short?: string;
  description?: string;
  /** boolean: flag; string: takes a value; string[]: variadic */
  type: 'boolean' | 'string' | 'string[]';
  /** the option itself must be passed */
  required: boolean;
  default?: unknown;
  choices?: readonly string[];
  env?: string;
}

export interface CommandSchema {
  name: string;
  /** full invocation path, e.g. "mycli deploy" */
  path: string;
  description?: string;
  aliases?: string[];
  usage: string;
  arguments: ArgumentSchema[];
  options: OptionSchema[];
  commands: CommandSchema[];
}

const clean = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as T;

function describeArgument(a: Argument): ArgumentSchema {
  return clean({
    name: a.name(),
    description: a.description,
    required: a.required,
    variadic: a.variadic,
    default: a.defaultValue,
    choices: a.argChoices,
  });
}

function describeOption(o: Option): OptionSchema {
  return clean({
    name: o.attributeName(),
    flags: o.flags,
    long: o.long,
    short: o.short,
    description: o.description,
    type: o.isBoolean() ? 'boolean' : o.variadic ? 'string[]' : 'string',
    required: o.mandatory,
    default: o.defaultValue,
    choices: o.argChoices,
    env: o.envVar,
  } as OptionSchema);
}

function commandPath(cmd: Command): string {
  const parts: string[] = [];
  for (let c: Command | null = cmd; c; c = c.parent) parts.unshift(c.name());
  return parts.join(' ');
}

const isHidden = (c: Command) => (c as unknown as { _hidden?: boolean })._hidden === true;

/** JSON schema of a command and all of its visible subcommands. */
export function describeCommand(cmd: Command): CommandSchema {
  return clean({
    name: cmd.name(),
    path: commandPath(cmd),
    description: cmd.description(),
    aliases: cmd.aliases().length ? cmd.aliases() : undefined,
    usage: `${commandPath(cmd)} ${cmd.usage()}`.trim(),
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

export { commandPath };
