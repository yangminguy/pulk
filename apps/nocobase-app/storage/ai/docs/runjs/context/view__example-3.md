---
title: "Header / Footer in content Example"
description: "Extracted example from ctx.view"
---

# ctx.view

## Header / Footer in content

```tsx
function DialogContent() {
  const ctx = useFlowViewContext();
  const { Header, Footer, close } = ctx.view;
  return (
    <div>
      <Header title="Edit" extra={<Button size="small">Help</Button>} />
      <div>Form content...</div>
      <Footer>
        <Button onClick={() => close()}>Cancel</Button>
        <Button type="primary" onClick={handleSubmit}>OK</Button>
      </Footer>
    </div>
  );
}
```
