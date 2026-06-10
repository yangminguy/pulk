import { SlideDeckSpec } from '../schemas/slide-deck';
import { generatePptx } from '../converters/pptx-converter';
import { generateSlideDeckPipeline } from '../services/slide-deck-generator';

describe('SlideDeck Generation Logic', () => {
  describe('Schema Validation (SlideDeckSpec)', () => {
    it('should successfully parse 3 valid forms of mock data (basic, complex, etc.)', () => {
      // Basic mock
      const basicMock = {
        title: 'Basic Presentation',
        slides: [
          {
            title: 'Slide 1',
            content: 'Hello World',
            layout: 'title-slide'
          }
        ]
      };
      
      // Complex mock
      const complexMock = {
        title: 'Complex Presentation',
        author: 'AI Agent',
        date: '2026-06-04',
        slides: [
          {
            title: 'Agenda',
            content: '1. Introduction\n2. Body\n3. Conclusion',
            layout: 'list',
            speakerNotes: 'Welcome everyone.'
          },
          {
            title: 'Body',
            content: 'Details here',
            layout: 'content'
          }
        ]
      };

      // Another valid mock
      const minimalMock = {
        title: 'Minimal Presentation',
        slides: []
      };

      expect(() => SlideDeckSpec.parse(basicMock)).not.toThrow();
      expect(() => SlideDeckSpec.parse(complexMock)).not.toThrow();
      expect(() => SlideDeckSpec.parse(minimalMock)).not.toThrow();
    });

    it('should throw validation error for 2 invalid forms of data (missing required fields)', () => {
      const invalidMock1 = {
        title: 'Missing slides'
        // missing 'slides' array
      };

      const invalidMock2 = {
        title: 'Missing slide title',
        slides: [
          {
            // missing 'title'
            content: 'No title slide'
          }
        ]
      };

      expect(() => SlideDeckSpec.parse(invalidMock1)).toThrow();
      expect(() => SlideDeckSpec.parse(invalidMock2)).toThrow();
    });
  });

  describe('PPTX Conversion', () => {
    it('should successfully convert a valid SlideDeckSpec to a PPTX buffer exceeding 0 bytes', async () => {
      const validSpec = {
        title: 'Test Deck',
        slides: [
          { title: 'Slide 1', content: 'Content', layout: 'title-slide' }
        ]
      };
      // Mocking validation to pass before the actual schema is implemented
      // If schema isn't there, it will throw. We want the test to fail at import or validation first.
      
      let parsedSpec;
      try {
        parsedSpec = SlideDeckSpec.parse(validSpec);
      } catch (e) {
        parsedSpec = validSpec; // fallback to raw mock for the sake of the next step if schema fails
      }
      
      const pptxBuffer = await generatePptx(parsedSpec);
      
      expect(pptxBuffer).toBeDefined();
      expect(Buffer.isBuffer(pptxBuffer)).toBe(true);
      expect(pptxBuffer.length).toBeGreaterThan(0);
    });
  });

  describe('End-to-End Pipeline', () => {
    it('should successfully run the pipeline from mock LLM response parsing to PPTX conversion', async () => {
      const mockLlmResponse = JSON.stringify({
        title: 'Generated Deck',
        slides: [
          { title: 'Intro', content: 'Mocked Content', layout: 'title-slide' }
        ]
      });

      const result = await generateSlideDeckPipeline(mockLlmResponse);

      expect(result.status).toBe('success');
      if (result.status !== 'success') throw new Error(result.message);
      expect(result.buffer).toBeDefined();
      expect(result.buffer.length).toBeGreaterThan(0);
    });
  });

  describe('Injected LLM Pipeline', () => {
    const input = {
      topic: '작은 브랜드 콘텐츠 전략',
      audience: '작은 브랜드 대표',
      keyPoints: ['문제 정의', '판매 논리', 'CTA'],
      author: '원민',
    };

    it('should generate a deck via injected llmComplete (success path)', async () => {
      const validJson = JSON.stringify({
        title: 'LLM Deck',
        author: '원민',
        slides: [
          { title: 'Intro', content: 'LLM made this', layout: 'TITLE_SLIDE' },
          { title: 'Body', content: 'Details', layout: 'CONTENT_SLIDE' },
        ],
      });
      const llmComplete = jest.fn().mockResolvedValue('```json\n' + validJson + '\n```');

      const result = await generateSlideDeckPipeline(input, { llmComplete });

      expect(result.status).toBe('success');
      if (result.status !== 'success') throw new Error(result.message);
      expect(result.source).toBe('llm');
      expect(result.spec.title).toBe('LLM Deck');
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(llmComplete).toHaveBeenCalledTimes(1);
    });

    it('should retry on malformed output then succeed (retry path)', async () => {
      const validJson = JSON.stringify({
        title: 'Recovered Deck',
        slides: [{ title: 'Slide', content: 'ok', layout: 'CONTENT_SLIDE' }],
      });
      const llmComplete = jest
        .fn()
        .mockResolvedValueOnce('not json at all')
        .mockResolvedValueOnce(JSON.stringify({ title: 'Bad', slides: [{ content: 'no title' }] })) // zod fail
        .mockResolvedValueOnce(validJson);

      const result = await generateSlideDeckPipeline(input, { llmComplete, maxRetries: 2 });

      expect(result.status).toBe('success');
      if (result.status !== 'success') throw new Error(result.message);
      expect(result.source).toBe('llm');
      expect(result.spec.title).toBe('Recovered Deck');
      expect(llmComplete).toHaveBeenCalledTimes(3);
    });

    it('should fall back to deterministic spec when LLM keeps failing', async () => {
      const llmComplete = jest.fn().mockResolvedValue('garbage non-json');

      const result = await generateSlideDeckPipeline(input, { llmComplete, maxRetries: 1 });

      expect(result.status).toBe('success');
      if (result.status !== 'success') throw new Error(result.message);
      expect(result.source).toBe('fallback');
      expect(result.spec.title).toBe(input.topic);
      expect(result.spec.slides.length).toBeGreaterThan(0);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(llmComplete).toHaveBeenCalledTimes(2); // 1 + maxRetries
    });

    it('should fall back deterministically when no llmComplete is injected', async () => {
      const result = await generateSlideDeckPipeline(input);

      expect(result.status).toBe('success');
      if (result.status !== 'success') throw new Error(result.message);
      expect(result.source).toBe('fallback');
      expect(result.spec.title).toBe(input.topic);
      expect(result.buffer.length).toBeGreaterThan(0);
    });

    it('should error when topic is missing', async () => {
      const result = await generateSlideDeckPipeline({ topic: '' });
      expect(result.status).toBe('error');
    });
  });
});
