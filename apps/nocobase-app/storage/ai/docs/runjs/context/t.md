---
title: "ctx.t()"
description: "i18n helper in RunJS for translating copy; uses the current context’s language. Use for buttons, titles, hints, etc."
---

# ctx.t()

i18n helper in RunJS for translating copy; uses the current context’s language. Use for buttons, titles, hints, etc.

## Use Cases

Available in all RunJS environments.

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Translation key or template with placeholders (e.g. `Hello {{name}}`, `{{count}} rows`) |
| `options` | `object` | Optional. Interpolation (e.g. `{ name: 'John', count: 5 }`) or i18n options (`defaultValue`, `ns`) |

## Returns

- Translated string; if key has no translation and no `defaultValue`, may return the key or the interpolated string.

## Examples

## Notes

- **Localization plugin**: Activate the localization plugin to manage translations. Missing keys can be collected for translation.
- i18next-style interpolation: use `{{varName}}` in the key and pass the same name in `options`.
- Language comes from the current context (e.g. `ctx.i18n.language`, user locale).

## Related

- [ctx.i18n](/runjs/context/i18n.md): read or change language

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/t__example-1.md`) - Extracted example from ctx.t()
- **Namespace (ns) Example** (`runjs/context/t__example-2.md`) - Extracted example from ctx.t()
- **Simple key Example** (`runjs/context/t__example-3.md`) - Extracted example from ctx.t()
- **With interpolation Example** (`runjs/context/t__example-4.md`) - Extracted example from ctx.t()
- **With interpolation Example** (`runjs/context/t__example-5.md`) - Extracted example from ctx.t()
- **Relative time etc. Example** (`runjs/context/t__example-6.md`) - Extracted example from ctx.t()
- **Specify namespace Example** (`runjs/context/t__example-7.md`) - Extracted example from ctx.t()

<!-- docs:splits:end -->
