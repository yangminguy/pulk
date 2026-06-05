import React from 'react';

export function SnapshotCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg bg-gray-200 p-4" role="status" aria-label="Loading snapshot">
      <div className="mb-2 h-6 w-3/4 rounded bg-gray-300" />
      <div className="h-4 w-full rounded bg-gray-300" />
      <div className="mt-2 h-4 w-5/6 rounded bg-gray-300" />
    </div>
  );
}
