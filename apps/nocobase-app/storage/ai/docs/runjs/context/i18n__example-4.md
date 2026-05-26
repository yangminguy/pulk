---
title: "Language switch button Example"
description: "Extracted example from ctx.i18n"
---

# ctx.i18n

## Language switch button

```ts
const { Button } = ctx.libs.antd;
const isZh = ctx.i18n.language.startsWith('zh');
ctx.render(
  <Button onClick={async () => {
    await ctx.i18n.changeLanguage(isZh ? 'en-US' : 'zh-CN');
  }}>
    {ctx.t(isZh ? 'Switch to English' : 'Switch to Chinese')}
  </Button>,
);
```
