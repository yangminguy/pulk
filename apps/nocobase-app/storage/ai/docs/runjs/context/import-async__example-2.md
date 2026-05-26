---
title: "Basic Example"
description: "Extracted example from ctx.importAsync()"
---

# ctx.importAsync()

## Basic

```javascript
const Vue = await ctx.importAsync('vue@3.4.0');

const relativeTime = await ctx.importAsync('dayjs@1/plugin/relativeTime.js');

const pkg = await ctx.importAsync('https://cdn.example.com/my-module.js');

await ctx.importAsync('https://cdn.example.com/theme.css');
```
