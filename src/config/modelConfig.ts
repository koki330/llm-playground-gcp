import path from 'path';
import fs from 'fs/promises';

// Define a comprehensive type for our model configuration
interface ModelConfig {
  modelGroups: { label: string; models: Record<string, string> }[];
  modelConfig: Record<string, { type: 'reasoning' | 'normal'; maxTokens: number; service?: string }>;
  monthlyLimitsUSD: Record<string, number>;
  pricingPerMillionTokensUSD: Record<string, { input: number; output: number }>;
}

// Cache the configuration so we don't read the file every time
let cachedConfig: ModelConfig | null = null;

/**
 * Reads and parses the model configuration from models.json.
 * Caches the result to avoid repeated file reads.
 * This function should only be used in a server-side context.
 */
export const getModelsConfig = async (): Promise<ModelConfig> => {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    // Construct the absolute path to the JSON file
    const jsonPath = path.join(process.cwd(), 'src', 'config', 'models.json');
    const fileContent = await fs.readFile(jsonPath, 'utf-8');
    const config = JSON.parse(fileContent) as ModelConfig;
    
    cachedConfig = config;
    return config;

  } catch (error) {
    console.error('Failed to read or parse models.json:', error);
    // In case of an error, throw it to make the issue visible
    throw new Error('Could not load model configuration.');
  }
};