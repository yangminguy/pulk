// cli-args — pure argv parser for the research-engine CLI. Kept side-effect-free
// (no config/adapters) so it can be unit-tested in isolation.
//
// Contract (WO-C research-bridge — flag names are frozen):
//   --request '<json>'      ResearchRequest JSON (required for a new run)
//   --resume  <runId>       resume an existing run (request then optional)
//   --slack-channel <ch>    Slack channel to report into
//   --slack-thread  <ts>    Slack thread ts to report into

import type { ResearchRequest } from '@l5/core';

export interface ParsedCliArgs {
  request?: ResearchRequest;
  runId?: string;
  resume: boolean;
  slackChannel?: string;
  slackThread?: string;
  error?: string;
}

const FLAGS_WITH_VALUE = new Set([
  '--request',
  '--resume',
  '--slack-channel',
  '--slack-thread',
]);

/** Read a flag value from either `--flag value` or `--flag=value`. */
function readValue(argv: string[], i: number): { value: string | undefined; next: number } {
  const tok = argv[i];
  const eq = tok.indexOf('=');
  if (eq > 0) return { value: tok.slice(eq + 1), next: i };
  const nxt = argv[i + 1];
  if (nxt === undefined || nxt.startsWith('--')) return { value: undefined, next: i };
  return { value: nxt, next: i + 1 };
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const out: ParsedCliArgs = { resume: false };
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    const name = raw.includes('=') ? raw.slice(0, raw.indexOf('=')) : raw;
    if (!FLAGS_WITH_VALUE.has(name)) continue;
    const { value, next } = readValue(argv, i);
    i = next;
    if (value === undefined) {
      out.error = `flag ${name} requires a value`;
      return out;
    }
    switch (name) {
      case '--request':
        try {
          out.request = JSON.parse(value) as ResearchRequest;
        } catch (err) {
          out.error = `--request is not valid JSON: ${(err as Error).message}`;
          return out;
        }
        break;
      case '--resume':
        out.resume = true;
        out.runId = value;
        break;
      case '--slack-channel':
        out.slackChannel = value;
        break;
      case '--slack-thread':
        out.slackThread = value;
        break;
    }
  }

  if (!out.resume && !out.request) {
    out.error = '--request <json> is required (or --resume <runId>)';
  }
  if (out.resume && !out.runId) {
    out.error = '--resume requires a runId';
  }
  if (out.request && (typeof out.request.topic !== 'string' || !out.request.topic.trim())) {
    out.error = '--request.topic must be a non-empty string';
  }
  return out;
}

export const USAGE = [
  'Usage: node dist/cli.js --request \'<ResearchRequest JSON>\' [--resume <runId>]',
  '                        [--slack-channel <channel>] [--slack-thread <ts>]',
  '',
  'ResearchRequest: { "topic": string, "researchPurpose": "LEARNING|TECHNICAL_RESEARCH|CONTENT_PLANNING|BUSINESS_RESEARCH|DECISION_SUPPORT", ... }',
].join('\n');
