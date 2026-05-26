---
title: "dnd-kit (with ?deps) Example"
description: "Extracted example from ctx.importAsync()"
---

# ctx.importAsync()

## dnd-kit (with ?deps)

```ts
const React = await ctx.importAsync('react@18.2.0');
const { createRoot } = await ctx.importAsync('react-dom@18.2.0/client');
const core = await ctx.importAsync('@dnd-kit/core@6.3.1?deps=react@18.2.0,react-dom@18.2.0');
// Use core (DndContext, useDraggable, useDroppable, etc.) with React
```
