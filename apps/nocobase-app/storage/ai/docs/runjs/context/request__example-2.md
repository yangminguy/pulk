---
title: "Type Example"
description: "Extracted example from ctx.request()"
---

# ctx.request()

## Type

```typescript
type RequestOptions = AxiosRequestConfig & {
  skipNotify?: boolean | ((error: any) => boolean);  // Skip global error toast on failure
  skipAuth?: boolean;                                 // Skip auth redirect (e.g. 401 → login)
};
```
