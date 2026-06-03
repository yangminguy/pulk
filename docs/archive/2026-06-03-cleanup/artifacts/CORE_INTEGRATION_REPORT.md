# Phase 3 & 4 Core Integration Report

## 1. Overview
Successfully integrated `@l5/core` domain logic into the `@l5/plugin-business-portfolio` NocoBase plugin. The core functions have been wrapped with custom NocoBase actions to allow the frontend and background processes to trigger domain logic safely while seamlessly interacting with the database collections.

## 2. Integrated Actions

We have created the `l5_core_actions` NocoBase resource with the following endpoints:

### `scoreFounderFit`
- **Purpose**: Evaluates how well a business idea matches the founder's profile (DNA).
- **Input**: `business_idea_id`
- **Process**: Fetches the specified idea and the founder's DNA from `business_ideas` and `founder_dna` collections respectively. It invokes `@l5/core`'s `scoreFounderFit` and updates the `founder_fit_score` directly on the `business_ideas` record.

### `generateBusinessBrief`
- **Purpose**: Generates an executive brief for a business idea using the founder's profile and past memory/lessons.
- **Input**: `business_idea_id`
- **Process**: Scores founder fit again (or utilizes existing data), fetches `founder_dna`, invokes `generateBusinessBrief` from `@l5/core`, and then creates or updates the corresponding record in the `business_briefs` collection.

### `calculatePmfScore`
- **Purpose**: Calculates the overall Product-Market Fit score for an experiment based on collected metrics.
- **Input**: `experiment_id`
- **Process**: Retrieves all records from `pmf_experiment_metrics` matching the experiment ID. Evaluates the PMF score via `@l5/core`'s `calculatePmfScore` and automatically updates the `pmf_score` field in the `pmf_experiments` collection.

### `decideToolCandidate`
- **Purpose**: Evaluates whether a bottleneck warrants building a custom internal tool.
- **Input**: `ToolRequestInput` (including `pmf_score`, `repetition_count`, `time_to_complete`, etc.)
- **Process**: Accepts JSON payload representing the bottleneck criteria and directly leverages `decideToolCandidate` from `@l5/core` to determine tool viability and priority, returning the `ToolCandidateDecision` object.

### `requiresFounderApproval`
- **Purpose**: Determines if a specific decision type and risk level mandate CEO/Founder or Legal approval.
- **Input**: `decisionType`, `riskLevel`, `title`, `description`, `related_business_id`.
- **Process**: Computes the approval gate requirements via `@l5/core`'s `requiresFounderApproval`. If approval is mandated, it automatically queues a decision record into the `decision_queue` collection with an 'open' status.

## 3. Storage and Repository Interactions
Each action relies on standard NocoBase repositories (`this.db.getRepository(...)`) for atomic fetch and update cycles. This ensures that the domain logic in `@l5/core` stays pure, while side effects and persistence constraints remain entirely managed by the NocoBase environment.

## 4. Next Steps
- Implement frontend triggers to dispatch requests to these `l5_core_actions` endpoints.
- Configure background Cron/Hermes tasks to routinely trigger these actions for stagnant or completed experiments.
