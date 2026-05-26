---
title: "HTML string Example"
description: "Extracted example from ctx.render()"
---

# ctx.render()

## HTML string

```ts
ctx.render('<h1>Hello World</h1>');

ctx.render('<div style="padding:16px">' + ctx.t('Content') + '</div>');

ctx.render(hasData ? `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>` : '<span style="color:#999">' + ctx.t('No data') + '</span>');
```
