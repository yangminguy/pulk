import { CollectionOptions } from '@nocobase/database';

export default {
  name: 'founder_dna',
  title: 'Founder DNA',
  shared: true,
  dumpRules: 'required',
  fields: [
    { name: 'category', type: 'string' },
    { name: 'statement', type: 'text' },
    { name: 'evidence', type: 'text' },
    { name: 'confidence', type: 'integer' }
  ]
} as CollectionOptions;
