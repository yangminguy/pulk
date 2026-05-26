---
title: "ctx.request()"
description: "Sends authenticated HTTP requests from RunJS. Requests use the app’s baseURL, token, locale, role, etc., and the app’s interceptors and error handling."
---

# ctx.request()

Sends authenticated HTTP requests from RunJS. Requests use the app’s baseURL, token, locale, role, etc., and the app’s interceptors and error handling.

## Use Cases

Use whenever RunJS needs to call a remote HTTP API: JSBlock, JSField, JSItem, JSColumn, event flow, linkage, JSAction, etc.

## Common parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | URL. Supports resource style (e.g. `users:list`, `posts:create`) or full URL |
| `method` | 'get' \| 'post' \| 'put' \| 'patch' \| 'delete' | HTTP method; default `'get'` |
| `params` | object | Query params (serialized to URL) |
| `data` | any | Request body for post/put/patch |
| `headers` | object | Custom headers |
| `skipNotify` | boolean \| (error) => boolean | When true or function returns true, no global error message |
| `skipAuth` | boolean | When true, 401 etc. do not trigger auth redirect (e.g. to login) |

## Resource-style URL

NocoBase resource API supports `resource:action` shorthand:

| Format | Description | Example |
|--------|-------------|---------|
| `collection:action` | Single-table CRUD | `users:list`, `users:get`, `users:create`, `posts:update` |
| `collection.relation:action` | Association (need `resourceOf` or primary key in URL) | `posts.comments:list` |

Relative URLs are joined with the app baseURL (usually `/api`). For cross-origin, use a full URL and ensure CORS on the target.

## Response

Returns Axios response. Common usage:

- `response.data`: response body
- List APIs often have `data.data` (records) + `data.meta` (pagination)
- Single/create/update often have `data.data` as one record

## Examples

## Notes

- **Errors**: Failed requests throw; by default a global error message is shown. Use `skipNotify: true` to handle yourself.
- **Auth**: Same-origin requests automatically send token, locale, role; cross-origin needs CORS and optional token in headers.
- **ACL**: Requests are subject to ACL; only resources the user can access are available.

## Related

- [ctx.message](/runjs/context/message.md): short feedback after request
- [ctx.notification](/runjs/context/notification.md): notification after request
- [ctx.render](/runjs/context/render.md): render result in UI
- [ctx.makeResource](/runjs/context/make-resource.md): build resource for chained loading (alternative to direct `ctx.request`)

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/request__example-1.md`) - Extracted example from ctx.request()
- **Type Example** (`runjs/context/request__example-2.md`) - Extracted example from ctx.request()
- **List Example** (`runjs/context/request__example-3.md`) - Extracted example from ctx.request()
- **Create Example** (`runjs/context/request__example-4.md`) - Extracted example from ctx.request()
- **Filter and sort Example** (`runjs/context/request__example-5.md`) - Extracted example from ctx.request()
- **Skip error notify Example** (`runjs/context/request__example-6.md`) - Extracted example from ctx.request()
- **Cross-origin Example** (`runjs/context/request__example-7.md`) - Extracted example from ctx.request()
- **With ctx.render Example** (`runjs/context/request__example-8.md`) - Extracted example from ctx.request()

<!-- docs:splits:end -->
