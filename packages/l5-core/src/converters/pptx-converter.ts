import PptxGenJS from 'pptxgenjs';
import type { SlideDeckSpecType } from '../schemas/slide-deck';

export async function generatePptx(spec: SlideDeckSpecType): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.title = spec.title;
  if (spec.author) pptx.author = spec.author;
  // TODO: MVP 이후 spec.date 활용 방안(예: 슬라이드 마스터 바닥글 또는 메타데이터 적용) 추가

  for (const slide of spec.slides) {
    // TODO: slide.layout (예: TITLE_SLIDE, CONTENT_SLIDE) 값에 따라 pptx.addSlide({ masterName: ... }) 등 레이아웃 분기 적용
    const s = pptx.addSlide();
    if (slide.title) {
      s.addText(slide.title, { x: 0.5, y: 0.5, fontSize: 24, bold: true });
    }
    if (slide.content) {
      s.addText(slide.content, { x: 0.5, y: 1.5, fontSize: 14 });
    }
    if (slide.speakerNotes) {
      s.addNotes(slide.speakerNotes);
    }
  }

  const output = await pptx.write({ outputType: 'nodebuffer' });
  return output as Buffer;
}
