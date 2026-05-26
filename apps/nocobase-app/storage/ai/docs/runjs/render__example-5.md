---
title: "Using External React and Components Example"
description: "Extracted example from Render in Container"
---

# Render in Container

## Using External React and Components

```jsx
const React = await ctx.importAsync('react@19.2.4');
const { Button } = await ctx.importAsync('antd@6.2.2?bundle');

ctx.render(<Button>Click</Button>);
```
