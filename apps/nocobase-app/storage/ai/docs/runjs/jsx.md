---
title: "JSX"
description: "RunJS supports JSX; you can write code like React components, and JSX is compiled before execution."
---

# JSX

RunJS supports JSX; you can write code like React components, and JSX is compiled before execution.

## Compilation

- JSX is transformed with [sucrase](https://github.com/alangpierce/sucrase)
- JSX compiles to `ctx.libs.React.createElement` and `ctx.libs.React.Fragment`
- **No need to import React**: write JSX directly; the compiler uses `ctx.libs.React`
- When loading external React via `ctx.importAsync('react@x.x.x')`, JSX uses that instance’s `createElement`

<!-- docs:splits:start -->

## Extracted references

- **Using Built-in React and Components Example** (`runjs/jsx__example-1.md`) - Extracted example from JSX
- **Using Built-in React and Components Example** (`runjs/jsx__example-2.md`) - Extracted example from JSX
- **Using External React and Components Example** (`runjs/jsx__example-3.md`) - Extracted example from JSX
- **Using External React and Components Example** (`runjs/jsx__example-4.md`) - Extracted example from JSX
- **JSX Basics Example** (`runjs/jsx__example-5.md`) - Extracted example from JSX

<!-- docs:splits:end -->
