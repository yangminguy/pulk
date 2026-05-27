import type { LLMClient } from './types';

export interface OpenAIClientOptions {
  apiKey: string;
  model?: string;
}

interface OpenAIResponse {
  choices: Array<{ message: { content: string | null } }>;
}

export function createOpenAIClient(opts: OpenAIClientOptions): LLMClient {
  return {
    async complete({ system, user }) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${opts.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: opts.model ?? 'gpt-4o',
          max_tokens: 1024,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${err}`);
      }

      const data = (await response.json()) as OpenAIResponse;
      const content = data.choices[0]?.message?.content;
      if (!content) throw new Error('No content in OpenAI response');
      return content;
    },
  };
}

// Legacy alias — keeps existing imports working
export const createAnthropicClient = createOpenAIClient;
export type AnthropicClientOptions = OpenAIClientOptions;
