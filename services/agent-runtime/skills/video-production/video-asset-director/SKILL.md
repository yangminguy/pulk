---
name: video-asset-director
description: Match planned scenes to supplied media, screenshots, stock assets and Factory graphic fallbacks with provenance. Use after scene and media planning before storyboard composition and timeline assembly.
---

# Video Asset Director

Use supplied assets before external media.

1. Rank assets by explanatory relevance, not decoration.
2. Record source, license, attribution and exact usable range.
3. Avoid unrelated foreign stock people in Korean-audience openings.
4. Resolve every Slide Worker `asset_request` to one of: user-supplied footage, official screenshot, licensed photo, licensed video, recorded UI, or a truthful Factory graphic.
5. For external media, record the search brief, selected subject, why it explains the assertion, source URL, license, crop and usable time range. Decorative stock does not count as evidence.
6. When source talking-head footage exists, allocate readable ranges across the rhythm plan instead of replacing all of them with slides.
7. Prefer a truthful Factory graphic fallback only when the scene's meaning is structural and no concrete media is required.
8. Block a scene when its selected visual form requires real evidence that is missing. Do not silently turn it into a generic text slide.

Write `05_asset_manifest.json` with assignments, `preview_asset`, provenance, license, crop/range, missing assets, fallbacks and approval requirements.
