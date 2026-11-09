# Changelog

## 0.2.0

- **Breaking:** requires Node.js 22+ (tested on 22, 24, 26). Node 20 reached end of life in April 2026.
- **Fix:** with commander 12–13, usage-error suggestions could point to the wrong subcommand
  (e.g. `Run "mycli describe hello"` for an error in `mycli deploy`).
- CI now tests every supported commander major (12, 13, 14, 15).

## 0.1.2

- First release with npm provenance (published from GitHub Actions, staged publishing with 2FA approval).
- Docs: commander 15 compatibility verified.

## 0.1.1

- Release pipeline: CI on Node 20/22/24, trusted publishing. README badges. No code changes.

## 0.1.0

- Initial release: `--json` envelopes, structured errors with suggestions, compact `describe` schema,
  agent auto-detection with `CLI_AGENT_MODE=human|json` override, stable exit codes,
  agent A/B benchmark and playground in `examples/playground`.
