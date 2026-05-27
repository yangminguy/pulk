import { describe, expect, it } from 'vitest';

import orchestrationClient from '../client';

describe('@l5/plugin-orchestration app package', () => {
  it('keeps a loadable client entry for NocoBase test discovery', () => {
    expect(orchestrationClient).toMatchObject({
      name: '@l5/plugin-orchestration',
    });
  });
});
