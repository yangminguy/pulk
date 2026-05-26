---
title: "JSX Basics Example"
description: "Extracted example from JSX"
---

# JSX

## JSX Basics

```tsx
const { React } = ctx.libs;
const items = ['a', 'b', 'c'];

ctx.render(
  <ul>
    {items.map((item, i) => (
      <li key={i}>{item}</li>
    ))}
  </ul>
);
```
