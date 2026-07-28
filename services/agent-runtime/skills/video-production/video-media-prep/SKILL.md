---
name: video-media-prep
description: Inspect supplied talking-head video, narration, screen recordings, images and audio to produce synchronized technical metadata and usable ranges. Use after scene planning whenever real media must be aligned to approved narration.
---

# Video Media Prep

Use deterministic metadata and transcription tools; never guess timing.

Run `scripts/inspect-source.mjs` for local source files. Pass approved script and transcript paths when both exist; any blocker in its report stops the chain.

1. Inventory files with stable IDs and checksums.
2. Preserve horizontal source framing and select approved narration as master clock.
3. Align transcript cues with the approved script.
4. Record duration, resolution, orientation, codecs, silence and corruption.
5. Mark candidate ranges without cutting source files.

Write `03_media_manifest.json`. Block on missing master media, unreadable input, or material script disagreement.
