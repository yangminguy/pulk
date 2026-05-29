import type { LLMClient } from './types';
import { createClaudeCLIClient } from '../../llm/claude-cli-client';

export interface OpenAIClientOptions {
  apiKey: string;
  model?: string;
}

export type LLMRole = 'cto-design' | 'cto-verify' | 'default';

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

// Factory that picks the appropriate backend based on the L5_LLM_BACKEND env var.
// Defaults to claude-cli; falls back to OpenAI when explicitly requested.
// Role determines model tier for claude-cli (cto-design -> opus, others -> haiku).
export function createDefaultLLMClient(role: LLMRole): LLMClient {
  const backend = process.env.L5_LLM_BACKEND ?? 'claude-cli';

  if (backend === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'createDefaultLLMClient: L5_LLM_BACKEND=openai but OPENAI_API_KEY is not set',
      );
    }
    return createOpenAIClient({ apiKey, model: 'gpt-4o' });
  }

  // Default: claude-cli.
  if (role === 'cto-design') {
    return createClaudeCLIClient({ model: 'opus' });
  }
  // cto-verify and default both use haiku.
  return createClaudeCLIClient({ model: 'haiku' });
}
