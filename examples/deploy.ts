#!/usr/bin/env node
import { Command } from 'commander';
import { AgentError, agentMode, run } from 'cli-agent-mode';

const program = agentMode(new Command('deployctl')).version('0.1.0').description('Deploy demo');

program
  .command('deploy')
  .description('Deploy an environment')
  .argument('<env>', 'environment name')
  .option('--dry-run', 'show the plan without deploying')
  .action(async (env: string, opts: { dryRun?: boolean }) => {
    if (!['staging', 'prod'].includes(env)) {
      throw new AgentError('ENV_NOT_FOUND', `Unknown environment "${env}"`, {
        suggestion: 'Use one of: staging, prod.',
        details: { available: ['staging', 'prod'] },
      });
    }
    return { env, url: `https://${env}.example.com`, dryRun: !!opts.dryRun };
  });

await run(program);
