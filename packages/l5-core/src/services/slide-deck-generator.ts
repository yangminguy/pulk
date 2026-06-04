import { SlideDeckSpec } from '../schemas/slide-deck';
import { generatePptx } from '../converters/pptx-converter';

export type SlideDeckPipelineResult = 
  | { status: 'success'; buffer: Buffer }
  | { status: 'error'; message: string; error?: unknown };

export async function generateSlideDeckPipeline(
  llmResponseJson: string,
): Promise<SlideDeckPipelineResult> {
  try {
    const raw = JSON.parse(llmResponseJson);
    const spec = SlideDeckSpec.parse(raw);
    const buffer = await generatePptx(spec);
    return { status: 'success', buffer };
  } catch (error: any) {
    return { status: 'error', message: error?.message || 'Unknown error', error };
  }
}
