---
title: "Multiple calls replace content Example"
description: "Extracted example from ctx.render()"
---

# ctx.render()

## Multiple calls replace content

```ts
ctx.render(<div>First</div>);
ctx.render(<div>Second</div>);  // Only "Second" is shown
```
