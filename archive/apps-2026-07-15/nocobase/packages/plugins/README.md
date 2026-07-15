# L5 Business OS - NocoBase Plugins

This directory contains all L5-specific NocoBase plugins.

## Plugin Packages

### P0 (Core MVP)

- **@l5/plugin-founder-dna** - Founder DNA management and updates
- **@l5/plugin-business-portfolio** - Business idea & portfolio management
- **@l5/plugin-pmf-experiment** - PMF experiment planning and scoring

### P1 (Essential Features)

- **@l5/plugin-workflow-factory** - Workflow generation interface
- **@l5/plugin-agent-staffing** - Agent assignment management
- **@l5/plugin-hermes-control-room** - Alert and decision queue monitoring
- **@l5/plugin-bpr-engine** - BPR logging and improvement tracking
- **@l5/plugin-tool-request** - Tool request evaluation lab
- **@l5/plugin-memory-room** - Insight storage and retrieval

## Plugin Architecture

Each plugin follows this structure:

```
@l5/plugin-{name}/
  package.json
  src/
    index.ts              # Plugin entry point
    client/               # Client-side code
      index.tsx           # React components
      hooks.ts            # Custom hooks
      styles.css
    server/               # Server-side code
      collections.ts      # Collection registration
      webhooks.ts         # Trigger.dev webhooks
    shared/               # Types and utilities
      types.ts
      helpers.ts
```

## Plugin Responsibilities

Each plugin:

1. **Registers Collections** - Define schemas in NocoBase
2. **Provides UI** - Rooms, boards, forms
3. **Calls L5 Core** - Domain logic via `@l5/core` package
4. **Handles Actions** - Approve, reject, generate
5. **Stores Results** - Persist to PostgreSQL via NocoBase

## Plugin Development Checklist

- [ ] Create package.json with `@l5/plugin-{name}`
- [ ] Create src/index.ts entry point
- [ ] Export default plugin registration function
- [ ] Import `@l5/core` for domain logic
- [ ] Create client components (React)
- [ ] Register collections in server code
- [ ] Add tests for critical flows
- [ ] Document collection schemas
- [ ] Document user workflows

## Example Plugin: Founder DNA

```typescript
// src/index.ts
import { Plugin } from '@nocobase/core';
import FounderDNARoom from './client/FounderDNARoom';
import { registerCollections } from './server/collections';

export default class FounderDNAPlugin extends Plugin {
  async load() {
    // Register collections
    this.db.collection(registerCollections);

    // Register UI
    this.pm.add('blocks', {
      name: 'founder-dna-room',
      uiSchema: {
        type: 'void',
        'x-component': FounderDNARoom
      }
    });
  }
}
```

## Communication with L5 Core

```typescript
// In plugin server code
import { scoreFounderFit } from '@l5/core';

// Get data from NocoBase
const founderDNA = await this.db.getRepository('founder_dna').find();
const businessIdea = await this.db.getRepository('business_idea').findById(id);

// Call l5-core function
const fitScore = scoreFounderFit(businessIdea, founderDNA);

// Store result back
await this.db.getRepository('business').update(businessId, {
  founder_fit_score: fitScore.score
});
```

## Testing Plugins

```bash
# From plugin directory
npm test

# From project root (all plugins)
pnpm -r test
```

## Troubleshooting

**Plugin not loading:**
- Check package.json has correct name format
- Verify export is default function
- Check console for registration errors
- Restart NocoBase

**Collection registration fails:**
- Verify table doesn't already exist
- Check field name conflicts
- Ensure database connection working

**L5 Core import fails:**
- Verify @l5/core is published/built
- Check package.json dependency
- Run `pnpm install`

## Next: Plugin Development

See [PLUGIN_DEVELOPMENT.md](../../docs/PLUGIN_DEVELOPMENT.md) for detailed guide.
