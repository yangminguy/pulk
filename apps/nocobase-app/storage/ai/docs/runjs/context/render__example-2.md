---
title: "React (JSX) Example"
description: "Extracted example from ctx.render()"
---

# ctx.render()

## React (JSX)

```tsx
const { Button, Card } = ctx.libs.antd;

ctx.render(
  <Card title={ctx.t('Title')}>
    <Button type="primary" onClick={() => ctx.message.success(ctx.t('Clicked'))}>
      {ctx.t('Button')}
    </Button>
  </Card>
);
```
