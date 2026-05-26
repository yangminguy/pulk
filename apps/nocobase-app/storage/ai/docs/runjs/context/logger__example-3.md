---
title: "Basic Example"
description: "Extracted example from ctx.logger"
---

# ctx.logger

## Basic

```ts
ctx.logger.info('Block loaded');
ctx.logger.warn('Request failed, using cache', { err });
ctx.logger.debug('Saving', { recordId: ctx.record?.id });
```
