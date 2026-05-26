---
title: "✅ Recommended: ctx.render() Example"
description: "Extracted example from ctx.element"
---

# ctx.element

## ✅ Recommended: ctx.render()

```ts
const { Button, Card } = ctx.libs.antd;
ctx.render(
  <Card title={ctx.t('Welcome')}>
    <Button type="primary">Click</Button>
  </Card>
);

ctx.render('<div style="padding:16px;">' + ctx.t('Content') + '</div>');

const div = document.createElement('div');
div.textContent = ctx.t('Hello');
ctx.render(div);
```
