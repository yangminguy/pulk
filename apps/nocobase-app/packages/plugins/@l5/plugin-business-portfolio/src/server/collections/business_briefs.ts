import { CollectionOptions } from '@nocobase/database';

export default {
  name: 'business_briefs',
  title: 'Business Briefs',
  shared: true,
  dumpRules: 'required',
  fields: [
    { name: 'business_id', type: 'string' },
    { name: 'title', type: 'string' },
    { name: 'summary', type: 'text' },
    { name: 'key_decisions_required', type: 'array' },
    { name: 'today_priority', type: 'text' },
    { name: 'alert_highlights', type: 'array' },
    { name: 'memory_lessons_applied', type: 'array' }
  ]
} as CollectionOptions;
