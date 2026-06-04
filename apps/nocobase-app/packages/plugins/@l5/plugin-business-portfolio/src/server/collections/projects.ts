import { CollectionOptions } from '@nocobase/database';

export default {
  name: 'projects',
  title: 'Projects',
  shared: true,
  dumpRules: 'required',
  fields: [
    { name: 'business_id', type: 'string' },
    { name: 'title', type: 'string' },
    { name: 'description', type: 'text' },
    { name: 'status', type: 'string', defaultValue: 'active' },
    { name: 'repo_path', type: 'string' }
  ]
} as CollectionOptions;
