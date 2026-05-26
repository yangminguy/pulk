---
title: "Read form values Example"
description: "Extracted example from ctx.form"
---

# ctx.form

## Read form values

```ts
// Current registered field values (default: only rendered fields)
const values = ctx.form.getFieldsValue();

// All field values (including unrendered, e.g. hidden, collapsed)
const allValues = ctx.form.getFieldsValue(true);

// Single field
const email = ctx.form.getFieldValue('email');

// Nested (e.g. sub-table)
const amount = ctx.form.getFieldValue(['orders', 0, 'amount']);
```
