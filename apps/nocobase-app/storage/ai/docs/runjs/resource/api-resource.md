---
title: "APIResource"
description: "Generic **API resource** that sends requests by URL; use for any HTTP endpoint. Extends FlowResource with request config and `refresh()`. Unlike [MultiRecordResource](./multi-record-resource.md) and [SingleRecordResource](./single-record-resource.md), APIResource does not depend on resource name and requests directly by URL; suitable for custom endpoints, third-party APIs, etc."
---

# APIResource

Generic **API resource** that sends requests by URL; use for any HTTP endpoint. Extends FlowResource with request config and `refresh()`. Unlike [MultiRecordResource](/runjs/resource/multi-record-resource.md) and [SingleRecordResource](/runjs/resource/single-record-resource.md), APIResource does not depend on resource name and requests directly by URL; suitable for custom endpoints, third-party APIs, etc.

**Create with**: `ctx.makeResource('APIResource')` or `ctx.initResource('APIResource')`. Before use call `setURL()`; RunJS context auto-injects `ctx.api` (APIClient), no need to call `setAPIClient` manually.

---

## Use cases

| Scenario | Description |
|----------|-------------|
| **Custom endpoints** | Call non-standard resource APIs (e.g. `/api/custom/stats`, `/api/reports/summary`) |
| **Third-party APIs** | Request external services via full URL (target must support CORS) |
| **One-off queries** | Fetch data temporarily, no need to bind to `ctx.resource` |
| **vs ctx.request** | Use APIResource when you need reactive data, events, or error state; use `ctx.request()` for simple one-off requests |

---

## Base (FlowResource)

All resources support:

| Method | Description |
|--------|-------------|
| `getData()` | Current data |
| `setData(value)` | Set data (local only) |
| `hasData()` | Whether data exists |
| `getMeta(key?)` / `setMeta(meta)` | Read/write metadata |
| `getError()` / `setError(err)` / `clearError()` | Error state |
| `on(event, callback)` / `once` / `off` / `emit` | Subscribe and emit events |

---

## Request config

| Method | Description |
|--------|-------------|
| `setAPIClient(api)` | Set APIClient instance (RunJS usually injects via context) |
| `getURL()` / `setURL(url)` | Request URL |
| `loading` | Load state (get/set) |
| `clearRequestParameters()` | Clear request params |
| `setRequestParameters(params)` | Merge request params |
| `setRequestMethod(method)` | Method (e.g. `'get'`, `'post'`, default `'get'`) |
| `addRequestHeader(key, value)` / `removeRequestHeader(key)` | Headers |
| `addRequestParameter(key, value)` / `getRequestParameter(key)` / `removeRequestParameter(key)` | Single param add/get/remove |
| `setRequestBody(data)` | Request body (for POST/PUT/PATCH) |
| `setRequestOptions(key, value)` / `getRequestOptions()` | General request options |

---

## URL format

- **Resource style**: NocoBase shorthand supported, e.g. `users:list`, `posts:get`, concatenated with baseURL
- **Relative path**: e.g. `/api/custom/endpoint`, concatenated with app baseURL
- **Full URL**: Use full address for cross-origin; target must configure CORS

---

## Data fetch

| Method | Description |
|--------|-------------|
| `refresh()` | Send request with current URL, method, params, headers, data; write response `data` to `setData(data)` and emit `'refresh'`. On failure sets `setError(err)` and throws `ResourceError`, does not emit `refresh`. Requires `api` and URL. |

---

## Examples

## Notes

- **ctx.api dependency**: RunJS injects `ctx.api`; usually no need to call `setAPIClient`. Set it manually when used without context.
- **refresh = request**: `refresh()` sends one request with current config; method, params, data, etc. must be set before calling.
- **Error does not update data**: On failure `getData()` keeps previous value; use `getError()` for error info.
- **vs ctx.request**: Use `ctx.request()` for simple one-off requests; use APIResource when you need reactive data, events, or error state management.

---

## Related

- [ctx.resource](/runjs/context/resource.md) - Resource instance in current context
- [ctx.initResource()](/runjs/context/init-resource.md) - Initialize and bind to ctx.resource
- [ctx.makeResource()](/runjs/context/make-resource.md) - Create resource instance without binding
- [ctx.request()](/runjs/context/request.md) - Generic HTTP request, for simple one-off calls
- [MultiRecordResource](/runjs/resource/multi-record-resource.md) - For data tables/lists, CRUD, pagination
- [SingleRecordResource](/runjs/resource/single-record-resource.md) - For single records

<!-- docs:splits:start -->

## Extracted references

- **Basic GET request Example** (`runjs/resource/api-resource__example-1.md`) - Extracted example from APIResource
- **Resource-style URL Example** (`runjs/resource/api-resource__example-2.md`) - Extracted example from APIResource
- **POST request (with body) Example** (`runjs/resource/api-resource__example-3.md`) - Extracted example from APIResource
- **Listen to refresh event Example** (`runjs/resource/api-resource__example-4.md`) - Extracted example from APIResource
- **Error handling Example** (`runjs/resource/api-resource__example-5.md`) - Extracted example from APIResource
- **Custom headers Example** (`runjs/resource/api-resource__example-6.md`) - Extracted example from APIResource

<!-- docs:splits:end -->
