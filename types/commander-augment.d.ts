import 'commander';

declare module 'commander' {
  interface Command {
    /** With cli-agent-mode the handler may return a JSON-serializable result. */
    action(fn: (this: this, ...args: any[]) => unknown): this;
  }
}
