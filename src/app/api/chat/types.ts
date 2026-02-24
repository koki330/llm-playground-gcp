import { CoreMessage } from 'ai';

export interface ChatRequestBody {
  messages: CoreMessage[];
  modelId: string;
  systemPrompt?: string;
  temperaturePreset?: 'precise' | 'balanced' | 'creative';
  maxTokens?: number;
  imageUris?: string[];
  pdfUris?: string[];
  fileContents?: { name: string; content: string }[];
  gpt5ReasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  gpt5Verbosity?: 'low' | 'medium' | 'high';
  gpt5GroundingEnabled?: boolean;
  geminiGroundingEnabled?: boolean;
  gemini3ThinkingLevel?: 'low' | 'high';
}

export type AppMessage = CoreMessage & {
  parts?: { type: string; text: string }[];
};

export interface HandlerParams {
  modelId: string;
  processedMessages: AppMessage[];
  systemPrompt?: string;
  finalTemperature?: number;
  maxTokens?: number;
  pricingPerMillionTokensUSD: Record<string, { input: number; output: number }>;
}
