# Repository integration

- Pulk owns `VideoExecutionBrief`, skills, run state, artifacts, approval receipts and revision routing.
- AI Slide Video Factory owns media resolution, scene schema, timeline calculations, Remotion components, captions, audio, rendering and export QA.
- Skills make judgments. Deterministic code validates, transforms and renders.
- Keep existing slide-only Factory jobs valid. Add mixed-media fields only as optional versioned extensions.
- Read the current Factory `src/lib/schema.ts` and component registry before selecting final templates or props.
