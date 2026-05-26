---
title: "Basic Example"
description: "Extracted example from ctx.requireAsync()"
---

# ctx.requireAsync()

## Basic

```javascript
const echarts = await ctx.requireAsync('echarts@5/dist/echarts.min.js');

const dayjs = await ctx.requireAsync('https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js');

await ctx.requireAsync('https://cdn.example.com/theme.css');
```
