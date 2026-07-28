# Visual Diversity Contract

Use diversity to improve comprehension, never as random decoration.

## Required scene fields

- `evidence_mode`: relationship, comparison, process, example, metric, interface, demonstration, emotion or direct_explanation
- `visual_form`: architecture, flow, funnel, roadmap, chart, metric_cards, comparison, reframe, kinetic_typography, screenshot, gallery, photo, external_video, recorded_ui, talking_head or mixed
- `render_mode`: graphic, photo, video, screenshot, recorded_ui, talking_head or mixed
- `selected_factory_scene_type`: one supported Factory scene type
- `asset_request`: required when the form needs concrete media

## Selection rules

- Use architecture only when modules or causes have real relationships.
- Use charts and metric cards only with numeric evidence and a stated source.
- Use screenshots or recorded UI when the interface itself is evidence.
- Use photos or external video when a real person, place, object or event improves understanding.
- Use talking head for trust, emotion, authority and direct explanation.
- Use kinetic typography briefly for a verbal reversal or memorable line.
- Use mixed scenes only when footage and graphics explain different parts of one assertion.

## Rhythm rules

For 8 or more scenes:

- at least four visual families
- no form above 35% of scenes
- no form repeated more than twice consecutively
- at least one concrete-media scene when usable supplied or licensed media exists
- at least one structural scene for a mechanism or process
- at least one direct-explanation or talking-head scene when usable source footage exists

These are minimum gates, not quotas. A form still needs truthful evidence.

## Composer fidelity

The Storyboard Composer must preserve `selected_factory_scene_type`, `render_mode`, media reference and asset provenance. Branding may change color, type, spacing and motion treatment. It must not replace different compositions with one shared layout.

The composed HTML must expose `data-visual-form`, `data-render-mode` and `data-layout` for every scene so deterministic validation can compare the fragment decision with the rendered result.
