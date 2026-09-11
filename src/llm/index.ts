import { config } from '../config.js';
import { OpenAiLlm } from './openai.js';
import type { Llm } from './types.js';

let instance: Llm | null = null;

/** Built lazily so a missing API key only fails when the LLM is actually used. */
export function llm(): Llm {
  if (instance) return instance;
  switch (config.llm.provider) {
    case 'openai':
      instance = new OpenAiLlm();
      return instance;
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${config.llm.provider}`);
  }
}

export function setLlmForTests(fake: Llm | null): void {
  instance = fake;
}
