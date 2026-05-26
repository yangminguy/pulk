---
title: "ctx.libs"
description: "`ctx.libs` is the unified namespace for RunJS built-in libraries (React, Ant Design, dayjs, lodash, etc.). **No `import` or async loading**; use `ctx.libs.xxx` directly."
---

# ctx.libs

`ctx.libs` is the unified namespace for RunJS built-in libraries (React, Ant Design, dayjs, lodash, etc.). **No `import` or async loading**; use `ctx.libs.xxx` directly.

## Use Cases

| Scenario | Description |
|----------|-------------|
| **JSBlock / JSField / JSItem / JSColumn** | React + Ant Design for UI, dayjs for dates, lodash for data |
| **Formulas / calculations** | formula or math for Excel-like formulas and math expressions |
| **Event flow / linkage** | lodash, dayjs, formula, etc. in logic-only code |

## Built-in libraries

| Property | Description | Docs |
|----------|-------------|------|
| `ctx.libs.React` | React core for JSX and Hooks | [React](https://react.dev/) |
| `ctx.libs.ReactDOM` | ReactDOM (e.g. `createRoot`) | [React DOM](https://react.dev/reference/react-dom) |
| `ctx.libs.antd` | Ant Design (Button, Card, Table, Form, Input, Modal, etc.) | [Ant Design](https://ant.design/components/overview/) |
| `ctx.libs.antdIcons` | Ant Design icons (PlusOutlined, UserOutlined, etc.) | [@ant-design/icons](https://ant.design/components/icon/) |
| `ctx.libs.dayjs` | Date/time utilities | [dayjs](https://day.js.org/) |
| `ctx.libs.lodash` | Utilities (get, set, debounce, etc.) | [Lodash](https://lodash.com/docs/) |
| `ctx.libs.formula` | Excel-like formulas (SUM, AVERAGE, IF, etc.) | [Formula.js](https://formulajs.info/functions/) |
| `ctx.libs.math` | Math expressions and evaluation | [Math.js](https://mathjs.org/docs/) |

## Top-level aliases

For backward compatibility, some libs are also on `ctx`: `ctx.React`, `ctx.ReactDOM`, `ctx.antd`, `ctx.dayjs`. **Prefer `ctx.libs.xxx`** for consistency and docs.

## Lazy loading

`lodash`, `formula`, `math` are **lazy-loaded**: the first access to `ctx.libs.lodash` triggers a dynamic import, then the result is cached. `React`, `antd`, `dayjs`, `antdIcons` are preloaded in context.

## Examples

## Notes

- **Mixing with ctx.importAsync**: If you load external React via `ctx.importAsync('react@19')`, JSX uses that instance; **do not** mix with `ctx.libs.antd`. Load antd for that React version (e.g. `ctx.importAsync('antd@5.x')`, `ctx.importAsync('@ant-design/icons@5.x')`).
- **Multiple React instances**: "Invalid hook call" or null hook dispatcher usually means multiple React instances. Before using `ctx.libs.React` or Hooks, run `await ctx.importAsync('react@version')` so the same React as the page is used.

## Related

- [ctx.importAsync()](/runjs/context/import-async.md): load external ESM (e.g. specific React, Vue)
- [ctx.render()](/runjs/context/render.md): render into container

<!-- docs:splits:start -->

## Extracted references

- **React and Ant Design Example** (`runjs/context/libs__example-1.md`) - Extracted example from ctx.libs
- **Hooks Example** (`runjs/context/libs__example-2.md`) - Extracted example from ctx.libs
- **Icons Example** (`runjs/context/libs__example-3.md`) - Extracted example from ctx.libs
- **dayjs Example** (`runjs/context/libs__example-4.md`) - Extracted example from ctx.libs
- **lodash Example** (`runjs/context/libs__example-5.md`) - Extracted example from ctx.libs
- **formula Example** (`runjs/context/libs__example-6.md`) - Extracted example from ctx.libs
- **math Example** (`runjs/context/libs__example-7.md`) - Extracted example from ctx.libs

<!-- docs:splits:end -->
