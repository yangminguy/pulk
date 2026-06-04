interface CardItem {
  id: string;
  [key: string]: unknown;
}

interface SceneItem {
  id: string;
  cards: CardItem[];
  [key: string]: unknown;
}

export function moveCard(
  scenes: SceneItem[],
  cardId: string,
  fromSceneId: string,
  toSceneId: string,
  toIndex: number,
): SceneItem[] {
  return scenes.map((scene) => {
    if (scene.id === fromSceneId && scene.id === toSceneId) {
      const cards = [...scene.cards];
      const fromIndex = cards.findIndex((c) => c.id === cardId);
      const [card] = cards.splice(fromIndex, 1);
      cards.splice(toIndex, 0, card);
      return { ...scene, cards };
    }
    if (scene.id === fromSceneId) {
      return { ...scene, cards: scene.cards.filter((c) => c.id !== cardId) };
    }
    if (scene.id === toSceneId) {
      const card = scenes
        .find((s) => s.id === fromSceneId)!
        .cards.find((c) => c.id === cardId)!;
      const cards = [...scene.cards];
      cards.splice(toIndex, 0, card);
      return { ...scene, cards };
    }
    return scene;
  });
}
