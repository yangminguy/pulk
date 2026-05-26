---
title: "Child logger Example"
description: "Extracted example from ctx.logger"
---

# ctx.logger

## Child logger

```ts
const log = ctx.logger.child({ scope: 'myBlock' });
log.info('Step 1');
log.debug('Step 2', { step: 2 });
```
