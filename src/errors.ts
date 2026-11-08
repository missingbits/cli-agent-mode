export interface AgentErrorOptions {
  /** One concrete next step the agent (or human) can follow literally. */
  suggestion?: string;
  /** Any JSON-serializable context: ids, paths, limits, etc. */
  details?: unknown;
  /** Process exit code. Defaults to 1. */
  exitCode?: number;
}

/**
 * An error with a stable machine-readable `code`.
 *
 * @example
 * throw new AgentError('ENV_NOT_FOUND', `Environment "${env}" does not exist`, {
 *   suggestion: 'Run "mycli env list" to see available environments.',
 * });
 */
export class AgentError extends Error {
  readonly code: string;
  readonly suggestion?: string;
  readonly details?: unknown;
  readonly exitCode: number;

  constructor(code: string, message: string, options: AgentErrorOptions = {}) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.suggestion = options.suggestion;
    this.details = options.details;
    this.exitCode = options.exitCode ?? 1;
  }
}

export interface ErrorPayload {
  code: string;
  message: string;
  suggestion?: string;
  details?: unknown;
}

export type Envelope<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: ErrorPayload };

/** Exit codes used by cli-agent-mode. */
export const EXIT = {
  OK: 0,
  ERROR: 1,
  USAGE: 2,
} as const;
