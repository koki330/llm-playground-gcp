import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { firestore } from '@/services/firestore';
import { FieldValue } from '@google-cloud/firestore';
import { getModelsConfig } from '@/config/modelConfig';

interface ChatRequestBody {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  modelId?: string;
  systemPrompt?: string;
  temperaturePreset?: 'precise' | 'balanced' | 'creative';
  maxTokens?: number;
}

const TEMP_PRESET_MAP: { [key: string]: number } = {
  precise: 0.2,
  balanced: 0.6,
  creative: 1.0,
};

const usageTracker = {
  getDocRef: (modelId: string) => firestore.collection('usage_tracking').doc(modelId),
  
  updateUsage: async (modelId: string, inputTokens: number = 0, outputTokens: number = 0, pricing: { input: number; output: number }) => {
    const safeInputTokens = inputTokens || 0;
    const safeOutputTokens = outputTokens || 0;
    
    if (!pricing) {
      console.warn(`No pricing info for model ${modelId}. Skipping usage update.`);
      return;
    }
    
    const inputCost = (safeInputTokens / 1_000_000) * pricing.input;
    const outputCost = (safeOutputTokens / 1_000_000) * pricing.output;
    const requestCost = inputCost + outputCost;
    const docRef = usageTracker.getDocRef(modelId);
    const currentMonth = new Date().toISOString().slice(0, 7);

    const doc = await docRef.get();
    if (doc.exists) {
      const docData = doc.data();
      if (docData && docData.year_month && docData.year_month !== currentMonth) {
        await docRef.set({
          total_cost: 0,
          year_month: currentMonth,
          daily_costs: {},
          last_updated: ''
        });
      }
    } else {
      await docRef.set({
        total_cost: 0,
        year_month: currentMonth,
        daily_costs: {},
        last_updated: ''
      });
    }

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
    const { messages, systemPrompt, temperaturePreset, maxTokens } = body;

    console.log('[DEBUG] Claude Sonnet 4.5 endpoint called');

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: process.env.LLM_GCP_ANTHROPIC_API_KEY,
    });

    const finalTemperature = temperaturePreset ? TEMP_PRESET_MAP[temperaturePreset] : 0.6;
    const modelId = 'claude-sonnet-4-5';

    // Get pricing configuration
    const { pricingPerMillionTokensUSD } = await getModelsConfig();
    const pricing = pricingPerMillionTokensUSD[modelId];

    // Create a readable stream for AI SDK v4 compatibility
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Generate a unique message ID
          const messageId = `msg_${Date.now()}`;

          // Call Anthropic API
          const anthropicStream = await anthropic.messages.stream({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: maxTokens || 64000,
            temperature: finalTemperature,
            system: systemPrompt || 'You are a helpful assistant.',
            messages: messages.map(m => ({
              role: m.role,
              content: m.content,
            })),
          });

          let fullText = '';
          let inputTokens = 0;
          let outputTokens = 0;

          // Handle streaming events
          for await (const event of anthropicStream) {
            if (event.type === 'content_block_delta') {
              if (event.delta.type === 'text_delta') {
                const textChunk = event.delta.text;
                fullText += textChunk;
                // Send text chunk in AI SDK v4 data stream format
                controller.enqueue(encoder.encode(`0:${JSON.stringify(textChunk)}\n`));
              }
            } else if (event.type === 'message_start') {
              inputTokens = event.message.usage.input_tokens;
              // Log the actual model being used
              console.log('[DEBUG] Anthropic API Response - Model:', event.message.model);
              console.log('[DEBUG] Anthropic API Response - ID:', event.message.id);
            } else if (event.type === 'message_delta') {
              outputTokens = event.usage.output_tokens;
            }
          }

          // Update usage tracking
          if (pricing) {
            await usageTracker.updateUsage(modelId, inputTokens, outputTokens, pricing);
          }

          controller.close();
        } catch (error) {
          console.error('[ERROR] Claude Sonnet 4.5 streaming error:', error);
          controller.enqueue(encoder.encode(`3:${JSON.stringify(error instanceof Error ? error.message : 'An error occurred')}\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error) {
    console.error('[ERROR] Claude Sonnet 4.5 API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An internal server error occurred.';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
