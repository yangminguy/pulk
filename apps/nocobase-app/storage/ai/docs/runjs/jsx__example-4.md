---
title: "Using External React and Components Example"
description: "Extracted example from JSX"
---

# JSX

## Using External React and Components

```tsx
const React = await ctx.importAsync('react@18.2.0');
const { Button } = await ctx.importAsync('antd@5.29.3?bundle&deps=react@18.2.0,react-dom@18.2.0');

ctx.render(<Button>Button</Button>);
```
