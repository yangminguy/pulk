---
title: "FullCalendar (ESM) Example"
description: "Extracted example from ctx.importAsync()"
---

# ctx.importAsync()

## FullCalendar (ESM)

```ts
const { Calendar } = await ctx.importAsync('@fullcalendar/core@6.1.20');
const dayGridPlugin = await ctx.importAsync('@fullcalendar/daygrid@6.1.20');

const calendarEl = document.createElement('div');
calendarEl.id = 'calendar';
ctx.render(calendarEl);

const calendar = new Calendar(calendarEl, {
  plugins: [dayGridPlugin.default || dayGridPlugin],
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: 'dayGridMonth',
  },
});

calendar.render();
```
