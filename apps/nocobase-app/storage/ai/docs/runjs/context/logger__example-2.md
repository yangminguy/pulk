---
title: "Recommended usage Example"
description: "Extracted example from ctx.logger"
---

# ctx.logger

## Recommended usage

```ts
ctx.logger.info('Block loaded');
ctx.logger.info('Success', { recordId: 456 });
ctx.logger.warn('Slow', { duration: 5000 });
ctx.logger.error('Failed', { userId: 123, action: 'create' });
ctx.logger.error('Request failed', { err });
```
