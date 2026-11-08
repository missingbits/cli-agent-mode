import { Command, Option } from 'commander';
import { describe, expect, it } from 'vitest';
import { AgentError, agentMode, run, type RunOptions } from '../src/index.js';

function makeCli() {
  const program = agentMode(new Command('mycli')).version('1.2.3').description('Demo CLI');
  program
    .command('deploy')
    .description('Deploy an environment')
    .argument('<env>', 'target environment')
    .option('--dry-run', 'do not change anything')
    .addOption(new Option('--region <region>', 'cloud region').choices(['eu', 'us']).default('eu'))
    .action(async (env: string, opts: { dryRun?: boolean; region: string }) => {
      if (env === 'missing') {
        throw new AgentError('ENV_NOT_FOUND', `Environment "${env}" does not exist`, {
          suggestion: 'Run "mycli envs" to list environments.',
          details: { env },
        });
      }
      if (env === 'boom') throw new Error('kaboom');
      console.log('stray log line');
      return { env, region: opts.region, dryRun: !!opts.dryRun };
    });
  program.command('hello').action(() => 'hi there');
  return program;
}

async function exec(args: string[], opts: Partial<RunOptions> = {}) {
  let out = '';
  let err = '';
  const res = await run(makeCli(), {
    args,
    env: {},
    setExitCode: false,
    stdout: { write: (s: string) => (out += s) },
    stderr: { write: (s: string) => (err += s) },
    ...opts,
  });
  return { ...res, out, err };
}

describe('json mode', () => {
  it('wraps the action result in an envelope', async () => {
    const r = await exec(['deploy', 'prod', '--json', '--region', 'us']);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.out)).toEqual({ ok: true, data: { env: 'prod', region: 'us', dryRun: false } });
  });

  it('keeps stdout clean: stray console.log goes to stderr', async () => {
    const r = await exec(['deploy', 'prod', '--json']);
    expect(r.out.trim().split('\n')).toHaveLength(1);
    expect(r.err).toContain('stray log line');
  });

  it('is enabled automatically for AI agents', async () => {
    const r = await exec(['hello'], { env: { CLAUDECODE: '1' } });
    expect(r.mode).toBe('json');
    expect(JSON.parse(r.out)).toEqual({ ok: true, data: 'hi there' });
  });

  it('CLI_AGENT_MODE=human overrides agent detection, --json still wins', async () => {
    expect((await exec(['hello'], { env: { CLAUDECODE: '1', CLI_AGENT_MODE: 'human' } })).mode).toBe('human');
    expect((await exec(['hello', '--json'], { env: { CLI_AGENT_MODE: 'human' } })).mode).toBe('json');
    expect((await exec(['hello'], { env: { CLI_AGENT_MODE: 'json' } })).mode).toBe('json');
  });

  it('ignores CURSOR_TRACE_ID (set for humans in Cursor terminal)', async () => {
    expect((await exec(['hello'], { env: { CURSOR_TRACE_ID: 'x' } })).mode).toBe('human');
  });

  it('does not treat --json after "--" as the flag', async () => {
    const r = await exec(['hello', '--', '--json']);
    expect(r.mode).toBe('human');
  });

  it('serializes AgentError with code, suggestion and details', async () => {
    const r = await exec(['deploy', 'missing', '--json']);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.out)).toEqual({
      ok: false,
      error: {
        code: 'ENV_NOT_FOUND',
        message: 'Environment "missing" does not exist',
        suggestion: 'Run "mycli envs" to list environments.',
        details: { env: 'missing' },
      },
    });
  });

  it('maps unexpected errors to INTERNAL_ERROR', async () => {
    const r = await exec(['deploy', 'boom', '--json']);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.out).error).toEqual({ code: 'INTERNAL_ERROR', message: 'kaboom' });
  });

  it('maps commander usage errors to stable codes with a describe hint', async () => {
    const r = await exec(['deploy', 'prod', '--nope', '--json']);
    expect(r.exitCode).toBe(2);
    const { error } = JSON.parse(r.out);
    expect(error.code).toBe('UNKNOWN_OPTION');
    expect(error.suggestion).toBe('Run "mycli describe deploy" to see accepted arguments and options.');
  });

  it('reports missing arguments and invalid choices', async () => {
    expect(JSON.parse((await exec(['deploy', '--json'])).out).error.code).toBe('MISSING_ARGUMENT');
    expect(JSON.parse((await exec(['deploy', 'x', '--region', 'mars', '--json'])).out).error.code).toBe(
      'INVALID_ARGUMENT',
    );
  });

  it('reports unknown commands and a missing subcommand', async () => {
    const unknown = await exec(['deplyo', '--json']);
    expect(JSON.parse(unknown.out).error.code).toBe('UNKNOWN_COMMAND');
    const none = await exec(['--json']);
    expect(none.exitCode).toBe(2);
    expect(JSON.parse(none.out).error.code).toBe('MISSING_COMMAND');
  });

  it('prints --version as data', async () => {
    const r = await exec(['--version', '--json']);
    expect(JSON.parse(r.out)).toEqual({ ok: true, data: { version: '1.2.3' } });
  });

  it('prints --help as the JSON schema of that command', async () => {
    const r = await exec(['deploy', '--help', '--json']);
    expect(r.exitCode).toBe(0);
    const { data } = JSON.parse(r.out);
    expect(data.usage).toBe('mycli deploy [options] <env>');
    expect(data.arguments[0]).toEqual({ name: 'env', description: 'target environment', required: true });
  });
});

describe('describe command', () => {
  it('emits the full schema', async () => {
    const r = await exec(['describe', '--json']);
    const { data } = JSON.parse(r.out);
    const names = data.commands.map((c: { name: string }) => c.name);
    expect(names).toEqual(expect.arrayContaining(['deploy', 'hello', 'describe']));
    const deploy = data.commands.find((c: { name: string }) => c.name === 'deploy');
    expect(deploy.options).toContainEqual({
      flags: '--region <region>',
      description: 'cloud region',
      default: 'eu',
      choices: ['eu', 'us'],
    });
    expect(deploy.options).toContainEqual({ flags: '--dry-run', description: 'do not change anything' });
    // compact: no false flags, no empty lists
    expect(JSON.stringify(data)).not.toMatch(/"required":false|"variadic":false|:\[\]/);
    expect(data.commands.find((c: { name: string }) => c.name === 'hello')).toEqual({
      name: 'hello',
      usage: 'mycli hello [options]',
    });
  });

  it('describes a single subcommand', async () => {
    const { data } = JSON.parse((await exec(['describe', 'deploy', '--json'])).out);
    expect(data.name).toBe('deploy');
  });

  it('fails with UNKNOWN_COMMAND for a bad path', async () => {
    const r = await exec(['describe', 'nope', '--json']);
    expect(r.exitCode).toBe(2);
    expect(JSON.parse(r.out).error.code).toBe('UNKNOWN_COMMAND');
  });
});

describe('human mode', () => {
  it('prints strings as-is and objects as pretty JSON', async () => {
    expect((await exec(['hello'])).out).toBe('hi there\n');
    expect((await exec(['deploy', 'prod'])).out).toContain('"env": "prod"');
  });

  it('prints errors with a hint on stderr', async () => {
    const r = await exec(['deploy', 'missing']);
    expect(r.out).toBe('');
    expect(r.err).toBe('error: Environment "missing" does not exist\nhint: Run "mycli envs" to list environments.\n');
  });

  it('keeps commander usage messages and adds a hint', async () => {
    const r = await exec(['deploy', 'prod', '--nope']);
    expect(r.exitCode).toBe(2);
    expect(r.err).toContain("unknown option '--nope'");
    expect(r.err).toContain('hint: Run "mycli describe deploy"');
  });

  it('prints regular help', async () => {
    const r = await exec(['--help']);
    expect(r.out).toContain('Usage: mycli');
    expect(r.out).toContain('--json');
  });
});
