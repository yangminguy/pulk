---
title: "open with config Example"
description: "Extracted example from ctx.message"
---

# ctx.message

## open with config

```ts
ctx.message.open({
  type: 'success',
  content: 'Custom success',
  duration: 5,
  onClose: () => console.log('closed'),
});
```
