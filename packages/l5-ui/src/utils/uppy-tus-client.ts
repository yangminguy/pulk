import type Uppy from '@uppy/core';
import Tus from '@uppy/tus';

export const configureUppyTus = (uppy: Uppy, endpoint: string) => {
  uppy.use(Tus, {
    endpoint,
    retryDelays: [0, 1000, 3000, 5000], // Retry settings
    limit: 1, // Concurrent uploads
  });
};
