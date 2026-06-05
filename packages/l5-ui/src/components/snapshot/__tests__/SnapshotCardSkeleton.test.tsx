import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SnapshotCardSkeleton } from '../SnapshotCardSkeleton';

describe('SnapshotCardSkeleton', () => {
  it('renders correctly with an animation class for accessibility', () => {
    const { getByRole } = render(<SnapshotCardSkeleton />);
    
    // Test if skeleton includes a 'status' role element
    const skeletonElement = getByRole('status');
    expect(skeletonElement).toBeInTheDocument();
    expect(skeletonElement).toHaveClass('animate-pulse');
  });
});
