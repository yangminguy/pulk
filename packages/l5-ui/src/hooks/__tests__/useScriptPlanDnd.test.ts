import { moveCard } from '../useScriptPlanDnd';

describe('useScriptPlanDnd (State Logic)', () => {
  it('should move a card from one scene to another', () => {
    const initialState = [
      {
        id: 'scene-1',
        cards: [{ id: 'card-1' }, { id: 'card-2' }]
      },
      {
        id: 'scene-2',
        cards: []
      }
    ];

    const result = moveCard(initialState, 'card-1', 'scene-1', 'scene-2', 0);

    expect(result[0].cards).toHaveLength(1);
    expect(result[0].cards[0].id).toBe('card-2');
    
    expect(result[1].cards).toHaveLength(1);
    expect(result[1].cards[0].id).toBe('card-1');
  });

  it('should verify dnd-kit dependencies are present and usable', async () => {
    // This test ensures the a11y and DndContext related imports from dnd-kit don't crash
    const { DndContext, KeyboardSensor, PointerSensor } = await import('@dnd-kit/core');
    expect(DndContext).toBeDefined();
    expect(KeyboardSensor).toBeDefined();
    expect(PointerSensor).toBeDefined();
  });
});
