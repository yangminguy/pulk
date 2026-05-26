---
title: "Import UMD/AMD Modules Example"
description: "Extracted example from Import Modules"
---

# Import Modules

## Import UMD/AMD Modules

```ts
// Shorthand (resolved via esm.sh with ...?raw)
const echarts = await ctx.requireAsync('echarts@5/dist/echarts.min.js');

// Full URL
const dayjs = await ctx.requireAsync('https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js');
```
