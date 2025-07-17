
export interface ModelPricing {
  input: number;
  output: number;
}

// Based on WORK_SUMMARY.md
export const PRICING_PER_MILLION_TOKENS_USD: Record<string, ModelPricing> = {
  // Anthropic Claude Series
  // 'claude4-opus': { input: 15, output: 75 },
  'claude-sonnet4': { input: 3, output: 15 },

  // OpenAI GPT Series
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'o3': { input: 2, output: 8 },
  'o4-mini': { input: 0.15, output: 0.6 },

  // Gemini Series
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
};

export const getPricing = (modelId: string): ModelPricing | undefined => {
  return PRICING_PER_MILLION_TOKENS_USD[modelId];
};
