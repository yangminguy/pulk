---
title: "Type Example"
description: "Extracted example from ctx.modal"
---

# ctx.modal

## Type

```ts
modal: {
  info: (config: ModalConfig) => Promise<void>;
  success: (config: ModalConfig) => Promise<void>;
  error: (config: ModalConfig) => Promise<void>;
  warning: (config: ModalConfig) => Promise<void>;
  confirm: (config: ModalConfig) => Promise<boolean>;  // true = OK, false = Cancel
};
```
