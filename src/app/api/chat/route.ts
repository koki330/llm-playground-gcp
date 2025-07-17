import { NextRequest, NextResponse } from 'next/server';
import { CoreMessage, streamText } from 'ai';
import { getOpenAIProvider } from '@/services/openai';
import { getAnthropicProvider } from '@/services/anthropic';
import { getGoogleProvider } from '@/services/vertexai';
import { firestore } from '@/services/firestore';
import { FieldValue } from '@google-cloud/firestore';
import { getPricing } from '@/config/pricing';
import { get_encoding } from 'tiktoken';

// The request body now only contains the final, combined conversation history.
interface ChatRequestBody {
  messages: CoreMessage[];
  modelId: string;
  systemPrompt?: string;
}

const MONTHLY_LIMITS_USD: { [key: string]: number } = {
  'claude-sonnet4': 120,
  'o3': 300,
};

// Initialize the tokenizer for OpenAI models
const enc = get_encoding('cl100k_base');

// Usage tracking logic remains the same.
const usageTracker = {
    getDocRef: (modelId: string) => firestore.collection('usage_tracking').doc(modelId),
    getUsage: async (modelId: string) => {
      const docRef = usageTracker.getDocRef(modelId);
      const doc = await docRef.get();
      const year_month = new Date().toISOString().slice(0, 7);
      if (!doc.exists || doc.data()?.year_month !== year_month) {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const lastUpdatedTimestamp = `${year}/${month}/${day}/${hours}:${minutes}`;
        await docRef.set({ total_cost: 0, year_month, daily_costs: {}, last_updated: lastUpdatedTimestamp });
        return { total_cost: 0, year_month };
      }
      return doc.data() as { total_cost: number; year_month: string };
    },
    updateUsage: async (modelId: string, inputTokens?: number, outputTokens?: number) => {
        const safeInputTokens = inputTokens || 0;
        const safeOutputTokens = outputTokens || 0;
        const pricing = getPricing(modelId);
        if (!pricing) {
          console.warn(`No pricing info for model ${modelId}. Skipping usage update.`);
          return;
        }
        const inputCost = (safeInputTokens / 1_000_000) * pricing.input;
        const outputCost = (safeOutputTokens / 1_000_000) * pricing.output;
        const requestCost = inputCost + outputCost;
        const docRef = usageTracker.getDocRef(modelId);
        const today = new Date().toISOString().slice(0, 10);
        const dailyCostField = `daily_costs.${today}`;
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const lastUpdatedTimestamp = `${year}/${month}/${day}/${hours}:${minutes}`;
        await docRef.update({
          total_cost: FieldValue.increment(requestCost),
          [dailyCostField]: FieldValue.increment(requestCost),
          last_updated: lastUpdatedTimestamp,
        });
    },
};

export async function POST(req: NextRequest) {
  try {
    const body: ChatRequestBody = await req.json();
    const { messages, modelId, systemPrompt } = body;

    if (!messages || !modelId) {
      return NextResponse.json({ error: 'messages and modelId are required' }, { status: 400 });
    }

    const limit = MONTHLY_LIMITS_USD[modelId];
    if (limit) {
      const usage = await usageTracker.getUsage(modelId);
      if (usage.total_cost >= limit) {
        return NextResponse.json({ error: `Monthly usage limit of ${limit} for ${modelId} has been reached.` }, { status: 429 });
      }
    }

    const onFinishCallback = async (result: {
        usage?: { promptTokens: number; completionTokens: number };
        text?: string;
        [key: string]: unknown;
    }) => {
        try {
            let promptTokens = 0;
            let completionTokens = 0;

            if (modelId.startsWith('gpt') || modelId.startsWith('o')) {
                // Manual token calculation for OpenAI
                const inputText = messages
                    .map(m => Array.isArray(m.content) 
                        ? m.content.filter(c => c.type === 'text').map(c => c.text).join('\n') 
                        : m.content)
                    .join('\n');
                promptTokens = enc.encode(inputText).length;
                completionTokens = result.text ? enc.encode(result.text).length : 0;
                console.log(`[DEBUG] Manual OpenAI token count: Input=${promptTokens}, Output=${completionTokens}`);
            } else {
                // Standard Vercel AI SDK usage for other providers
                const usage = result.usage;
                if (!usage) {
                    console.error(`[ERROR] 'usage' object is missing in onFinish callback for ${modelId}.`);
                    return;
                }
                promptTokens = usage.promptTokens;
                completionTokens = usage.completionTokens;
            }

            await usageTracker.updateUsage(modelId, promptTokens, completionTokens);
        } catch (error) {
            console.error(`[FATAL ERROR] An unexpected error occurred inside onFinish for ${modelId}:`, error);
        }
    };

    const onErrorCallback = ({ error }: { error: unknown }) => {
        console.error(`[STREAM_ERROR] An error occurred during the stream for model ${modelId}:`, error);
    };

    if (modelId.startsWith('gpt') || modelId.startsWith('o')) {
        const result = await streamText({
            model: getOpenAIProvider()(modelId),
            messages: messages,
            system: systemPrompt,
            onFinish: onFinishCallback,
            onError: onErrorCallback,
        });
        return result.toDataStreamResponse();

    } else if (modelId.startsWith('claude')) {
        const claudeModelMap: { [key: string]: string } = {
            // 'claude4-opus': 'claude-opus-4-20250514',
            'claude-sonnet4': 'claude-sonnet-4-20250514'
        };
        const anthropicModelId = claudeModelMap[modelId] || modelId;
        const result = await streamText({
            model: getAnthropicProvider()(anthropicModelId),
            messages: messages,
            system: systemPrompt || 'You are a helpful assistant.',
            onFinish: onFinishCallback,
            onError: onErrorCallback,
        });
        return result.toDataStreamResponse();

    } else if (modelId.startsWith('gemini')) {
        const result = await streamText({
            model: getGoogleProvider()(modelId),
            messages: messages,
            system: systemPrompt,
            onFinish: onFinishCallback,
            onError: onErrorCallback,
        });
        return result.toDataStreamResponse();

    } else {
      return NextResponse.json({ error: `Model ${modelId} not supported yet.` }, { status: 400 });
    }

  } catch (error) {
    console.error('Error in chat API:', error);
    const errorMessage = error instanceof Error ? error.message : 'An internal server error occurred.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}