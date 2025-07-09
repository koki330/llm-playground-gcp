export type AiProvider = 'anthropic' | 'openai' | 'gemini';

export interface AiModel {
  id: string;
  name: string;
  provider: AiProvider;
  apiKeyEnvVar?: string;
  serviceAccountEnvVar?: string;
  pricing?: {
    input: number; // Price per token
    output: number; // Price per token
  };
}

export const SUPPORTED_MODELS: AiModel[] = [
  // --- Anthropic Models ---
  {
    id: 'claude-3-5-sonnet-20240620',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'claude-3-sonnet-20240229',
    name: 'Claude 3 Sonnet',
    provider: 'anthropic',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    provider: 'anthropic',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
  },

  // --- OpenAI Models ---
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    apiKeyEnvVar: 'OPENAI_API_KEY',
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    provider: 'openai',
    apiKeyEnvVar: 'OPENAI_API_KEY',
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    apiKeyEnvVar: 'OPENAI_API_KEY',
  },

  // --- Gemini Models (via Vertex AI) ---
  {
    id: 'gemini-1.5-pro-001',
    name: 'Gemini 1.5 Pro',
    provider: 'gemini',
    serviceAccountEnvVar: 'GEMINI_SA_KEY_BASE64',
  },
  {
    id: 'gemini-1.5-flash-001',
    name: 'Gemini 1.5 Flash',
    provider: 'gemini',
    serviceAccountEnvVar: 'GEMINI_SA_KEY_BASE64',
  },
  {
    id: 'gemini-2.5-pro-001', // Using a placeholder ID
    name: 'Gemini 2.5 Pro',
    provider: 'gemini',
    serviceAccountEnvVar: 'GEMINI_SA_KEY_BASE64',
    pricing: {
      input: 0.00125 / 1000, // $0.00125 per 1k tokens
      output: 0.01 / 1000,    // $0.01 per 1k tokens
    },
  },
];

export const ModelProviderDetails = {
  anthropic: { name: 'Anthropic', apiKeyEnvVar: 'ANTHROPIC_API_KEY' },
  openai: { name: 'OpenAI', apiKeyEnvVar: 'OPENAI_API_KEY' },
  gemini: { name: 'Google Gemini', serviceAccountEnvVar: 'GEMINI_SA_KEY_BASE64' },
};