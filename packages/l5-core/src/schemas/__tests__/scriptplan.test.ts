import { scriptPlanSchema } from '../scriptplan';

describe('ScriptPlan Schema Validation', () => {
  it('should successfully parse a valid nested script plan (Episode > Scene > Card)', () => {
    const validData = {
      id: 'ep-1',
      title: 'Episode 1',
      scenes: [
        {
          id: 'scene-1',
          title: 'Scene 1',
          cards: [
            { id: 'card-1', content: 'Card 1 content', order: 0 },
            { id: 'card-2', content: 'Card 2 content', order: 1 }
          ]
        }
      ]
    };

    const result = scriptPlanSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should fail when required fields are missing', () => {
    const invalidData = {
      id: 'ep-1',
      // title missing
      scenes: []
    };

    const result = scriptPlanSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].path).toContain('title');
    }
  });

  it('should fail when nested card is invalid', () => {
    const invalidNestedData = {
      id: 'ep-1',
      title: 'Episode 1',
      scenes: [
        {
          id: 'scene-1',
          title: 'Scene 1',
          cards: [
            { id: 'card-1' } // missing content, order
          ]
        }
      ]
    };

    const result = scriptPlanSchema.safeParse(invalidNestedData);
    expect(result.success).toBe(false);
  });
});
