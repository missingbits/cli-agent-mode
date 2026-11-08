/**
 * Synchronous, dependency-free detection of AI coding agents.
 * Env variables mirror @vercel/detect-agent (Nov 2026) plus the `AI_AGENT` convention.
 * CURSOR_TRACE_ID is deliberately ignored: it is also set in Cursor's terminal for humans.
 * Returns the agent name or `undefined`.
 */
export function detectAgent(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const aiAgent = env.AI_AGENT?.trim();
  if (aiAgent) return aiAgent;
  if (env.CLAUDECODE || env.CLAUDE_CODE) return 'claude';
  if (env.CURSOR_AGENT || env.CURSOR_EXTENSION_HOST_ROLE === 'agent-exec') return 'cursor-cli';
  if (env.GEMINI_CLI) return 'gemini';
  if (env.CODEX_SANDBOX || env.CODEX_CI || env.CODEX_THREAD_ID) return 'codex';
  if (env.ANTIGRAVITY_AGENT) return 'antigravity';
  if (env.AUGMENT_AGENT) return 'augment-cli';
  if (env.OPENCODE === '1' || env.OPENCODE_CLIENT) return 'opencode';
  if (env.COPILOT_MODEL || env.COPILOT_ALLOW_ALL) return 'github-copilot';
  if (env.REPL_ID) return 'replit';
  return undefined;
}
