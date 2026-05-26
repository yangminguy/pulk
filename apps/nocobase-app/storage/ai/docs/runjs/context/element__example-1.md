---
title: "Type Example"
description: "Extracted example from ctx.element"
---

# ctx.element

## Type

```typescript
element: ElementProxy | undefined;

class ElementProxy {
  __el: HTMLElement;  // Internal native DOM (only for specific cases)
  innerHTML: string;  // Read/write sanitized with DOMPurify
  outerHTML: string;
  appendChild(child: HTMLElement | string): void;
  // Other HTMLElement methods passed through (not recommended)
}
```
