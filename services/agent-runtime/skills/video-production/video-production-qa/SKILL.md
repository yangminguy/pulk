---
name: video-production-qa
description: Review storyboard, pilot or final video for promise fulfillment, script fidelity, visual relevance, framing, synchronization, captions, audio and technical output. Use at storyboard review, after pilot rendering and after final rendering.
---

# Video Production QA

Run deterministic checks before editorial judgment.

1. Select mode: `storyboard`, `pilot`, or `final`.
2. Verify title promise, script coverage and truthful evidence.
3. Check horizontal framing, cuts, motion relevance, static captions, audio masking and sync.
4. Verify output duration, resolution, frame rate and required reports.
5. Assign every issue an owning skill, affected artifacts and rerun point.

Write `10_qa_report.json` and `.md`. Return `PASS`, `NEEDS_REVISION`, or `BLOCKED`; never pass a promise, script, sync, or technical failure.
