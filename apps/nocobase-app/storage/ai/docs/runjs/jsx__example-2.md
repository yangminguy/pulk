---
title: "Using Built-in React and Components Example"
description: "Extracted example from JSX"
---

# JSX

## Using Built-in React and Components

```tsx
const { React } = ctx.libs;
const { useState } = React;

const Counter = () => {
  const [count, setCount] = useState(0);
  return <div>Count: {count}</div>;
};

ctx.render(<Counter />);
```
