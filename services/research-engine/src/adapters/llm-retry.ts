// Retry decorator for the LLM client.
//
// A research run issues 40+ LLM calls (query expansion, per-chunk atom
// extraction, synthesis clustering, verification, per-chapter book writing).
// The claude CLI occasionally fails a single call transiently (cold start,
// overload, exit 1 with no stderr). Without a retry, one transient failure
// aborts the whole run — resume exists but requires manual --resume. This
// wrapper retries transport failures with exponential backoff so a run
// survives isolated blips. Parse-level fallbacks still live in the domain;
// this only guards the transport.

import type { LLMClient } from '@l5/core';

export interface RetryOptions {
  attempts?: number; // total attempts including the first (default 3)
  baseDelayMs?: number; // backoff base (default 2000)
  log?: (msg: string) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function withRetry(inner: LLMClient, opts: RetryOptions = {}): LLMClient {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const base = opts.baseDelayMs ?? 2000;
  const log = opts.log ?? (() => {});
  return {
    async complete(args) {
      let lastErr: unknown;
      for (let i = 1; i <= attempts; i += 1) {
        try {
          return await inner.complete(args);
        } catch (err) {
          lastErr = err;
          if (i < attempts) {
            const delay = base * 2 ** (i - 1);
            log(
              `[llm-retry] ${args.trace_name ?? 'call'} attempt ${i}/${attempts} failed: ${
                (err as Error).message
              } — retrying in ${delay}ms`,
            );
            await sleep(delay);
          }
        }
      }
      throw lastErr;
    },
  };
}
