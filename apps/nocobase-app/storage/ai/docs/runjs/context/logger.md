---
title: "ctx.logger"
description: "Logging built on [pino](https://github.com/pinojs/pino); outputs structured JSON. Prefer `ctx.logger` over `console` for collection and analysis."
---

# ctx.logger

Logging built on [pino](https://github.com/pinojs/pino); outputs structured JSON. Prefer `ctx.logger` over `console` for collection and analysis.

## Use Cases

Available in all RunJS contexts for debugging, error tracking, and performance.

## Log levels

From highest to lowest:

| Level | Method | Description |
|-------|--------|-------------|
| `fatal` | `ctx.logger.fatal()` | Fatal; usually process exit |
| `error` | `ctx.logger.error()` | Error; request or operation failed |
| `warn` | `ctx.logger.warn()` | Warning; potential issue |
| `info` | `ctx.logger.info()` | General runtime info |
| `debug` | `ctx.logger.debug()` | Debug; development |
| `trace` | `ctx.logger.trace()` | Verbose; deep diagnosis |

## Examples

### vs console

Prefer `ctx.logger` for structured JSON. Rough mapping: `console.log` → `ctx.logger.info`, `console.error` → `ctx.logger.error`, `console.warn` → `ctx.logger.warn`.

## Output format

pino outputs JSON with:

- `level`: numeric level
- `time`: timestamp (ms)
- `msg`: message
- `module`: `flow-engine`
- Any custom fields passed in the object

## Notes

- Logs are JSON for easy collection and querying
- Child loggers from `child()` also work well with `level(msg, meta)`
- Some environments (e.g. workflow) may use different log handling

## Related

- [pino](https://github.com/pinojs/pino)

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/logger__example-1.md`) - Extracted example from ctx.logger
- **Recommended usage Example** (`runjs/context/logger__example-2.md`) - Extracted example from ctx.logger
- **Basic Example** (`runjs/context/logger__example-3.md`) - Extracted example from ctx.logger
- **Child logger Example** (`runjs/context/logger__example-4.md`) - Extracted example from ctx.logger

<!-- docs:splits:end -->
