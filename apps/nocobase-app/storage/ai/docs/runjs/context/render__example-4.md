---
title: "DOM node Example"
description: "Extracted example from ctx.render()"
---

# ctx.render()

## DOM node

```ts
const div = document.createElement('div');
div.textContent = 'Hello World';
ctx.render(div);

const container = document.createElement('div');
container.style.width = '100%';
container.style.height = '400px';
ctx.render(container);
const chart = echarts.init(container);
chart.setOption({ ... });
```
