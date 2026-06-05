import { SnapshotSchema } from '../snapshot';

describe('SnapshotSchema', () => {
  it('should parse valid snapshot data successfully', () => {
    const validData = {
      title: 'Business PT Context',
      content: 'This is the main content of the snapshot.',
      theme: 'dark'
    };

    const result = SnapshotSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should return error if required fields are missing', () => {
    const invalidData = {
      theme: 'dark'
    };

    const result = SnapshotSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});
