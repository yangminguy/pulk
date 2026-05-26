---
title: "Custom duration and key Example"
description: "Extracted example from ctx.notification"
---

# ctx.notification

## Custom duration and key

```ts
ctx.notification.open({
  key: 'task-123',
  message: ctx.t('Task in progress'),
  description: ctx.t('Please wait...'),
  duration: 0,
});

ctx.notification.destroy('task-123');
```
