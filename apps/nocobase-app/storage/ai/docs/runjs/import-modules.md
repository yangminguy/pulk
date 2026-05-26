---
title: "Import Modules"
description: "In RunJS you can use two kinds of modules: **built-in modules** (via `ctx.libs`, no import needed) and **external modules** (loaded on demand via `ctx.importAsync()` or `ctx.requireAsync()`)."
---

# Import Modules

In RunJS you can use two kinds of modules: **built-in modules** (via `ctx.libs`, no import needed) and **external modules** (loaded on demand via `ctx.importAsync()` or `ctx.requireAsync()`).

---

## Built-in Modules - ctx.libs (no import)

RunJS provides common libraries via `ctx.libs`; you can use them directly **without** `import` or async loading.

| Property | Description |
|----------|-------------|
| **ctx.libs.React** | React core for JSX and Hooks |
| **ctx.libs.ReactDOM** | ReactDOM (e.g. for createRoot) |
| **ctx.libs.antd** | Ant Design components |
| **ctx.libs.antdIcons** | Ant Design icons |
| **ctx.libs.math** | [Math.js](https://mathjs.org/): math expressions, matrix operations, etc. |
| **ctx.libs.formula** | [Formula.js](https://formulajs.github.io/): Excel-like formulas (SUM, AVERAGE, etc.) |

## External Modules

For third-party libraries, choose the loader by module format:

- **ESM** → use `ctx.importAsync()`
- **UMD/AMD** → use `ctx.requireAsync()`

---

<!-- docs:splits:start -->

## Extracted references

- **Example: React and antd Example** (`runjs/import-modules__example-1.md`) - Extracted example from Import Modules
- **Example: ctx.libs.math Example** (`runjs/import-modules__example-2.md`) - Extracted example from Import Modules
- **Example: ctx.libs.formula Example** (`runjs/import-modules__example-3.md`) - Extracted example from Import Modules
- **Import ESM Modules Example** (`runjs/import-modules__example-4.md`) - Extracted example from Import Modules
- **Import ESM Modules Example** (`runjs/import-modules__example-5.md`) - Extracted example from Import Modules
- **Import UMD/AMD Modules Example** (`runjs/import-modules__example-6.md`) - Extracted example from Import Modules
- **Import UMD/AMD Modules Example** (`runjs/import-modules__example-7.md`) - Extracted example from Import Modules

<!-- docs:splits:end -->
