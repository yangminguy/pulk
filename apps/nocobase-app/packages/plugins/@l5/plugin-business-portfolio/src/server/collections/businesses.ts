import { CollectionOptions } from '@nocobase/database';

export default {
  name: 'businesses',
  title: 'Businesses',
  shared: true,
  dumpRules: 'required',
  fields: [
    { name: 'title', type: 'string' },
    { name: 'one_liner', type: 'text' },
    { name: 'status', type: 'string', defaultValue: 'idea' },
    { name: 'founder_fit_score', type: 'float' },
    { name: 'opportunity_score', type: 'float' },
    { name: 'kill_criteria', type: 'array' },
    { name: 'scale_criteria', type: 'array' },
    { name: 'created_from_idea_id', type: 'string' },
    // Absolute path to the business's working repo. When set, CTO dispatch runs
    // the agent in this repo; when empty, falls back to L5_DEFAULT_PROJECT_PATH (sandbox).
    { name: 'repo_path', type: 'string' }
  ]
} as CollectionOptions;
