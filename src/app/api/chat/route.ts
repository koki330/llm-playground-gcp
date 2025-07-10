import { NextRequest, NextResponse } from 'next/server';
import { vertexAIService } from '@/services/vertexai';
import { openAIService } from '@/services/openai';
import { anthropicService } from '@/services/anthropic';
import { firestore } from '@/services/firestore';
import { FieldValue } from '@google-cloud/firestore';

const GEMINI_2_5_PRO_MODEL_ID = 'gemini-2.5-pro';
const MONTHLY_LIMIT_USD = 300;

// Pricing per 1 million tokens for Gemini 2.5 Pro
const PRICING = {
  INPUT: 1.25,
  OUTPUT: 10.00,
};

// Helper to manage usage tracking in Firestore
const usageTracker = {
  getDocRef: () => firestore.collection('usage_tracking').doc(GEMINI_2_5_PRO_MODEL_ID),

  getUsage: async () => {
    const docRef = usageTracker.getDocRef();
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

  updateUsage: async (inputTokens: number, outputTokens: number) => {
    const inputCost = (inputTokens / 1_000_000) * PRICING.INPUT;
    const outputCost = (outputTokens / 1_000_000) * PRICING.OUTPUT;
    const requestCost = inputCost + outputCost;
    const docRef = usageTracker.getDocRef();
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

// Stream transformers for different AI services
async function* vertexAIStreamTransformer(stream: AsyncGenerator<any>, onComplete: (usage: any) => void) {
  const encoder = new TextEncoder();
  let usageMetadata;
  for await (const chunk of stream) {
    const text = chunk.candidates[0]?.content?.parts[0]?.text;
    if (text) yield encoder.encode(text);
    if (chunk.usageMetadata) usageMetadata = chunk.usageMetadata;
  }
  if (usageMetadata) onComplete(usageMetadata);
}

async function* openAIStreamTransformer(stream: AsyncIterable<any>) {
  const encoder = new TextEncoder();
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield encoder.encode(text);
  }
}

async function* anthropicStreamTransformer(stream: AsyncIterable<any>) {
  const encoder = new TextEncoder();
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta') {
      const text = chunk.delta.text;
      if (text) yield encoder.encode(text);
    }
  }
}

function toReadableStream(asyncIterator: AsyncGenerator<any>): ReadableStream {
  let iterator = asyncIterator;
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, modelId, systemPrompt } = body; // Extract systemPrompt
    console.log(`Received request for modelId: ${modelId}`); // Add this line for logging

    if (!messages || !modelId) {
      return NextResponse.json({ error: 'messages and modelId are required' }, { status: 400 });
    }

    if (modelId === GEMINI_2_5_PRO_MODEL_ID) {
      const usage = await usageTracker.getUsage();
      if (usage.total_cost >= MONTHLY_LIMIT_USD) {
        return NextResponse.json({ error: `Monthly usage limit of ${MONTHLY_LIMIT_USD} for ${modelId} has been reached.` }, { status: 429 });
      }
    }

    let readableStream;

    if (modelId.startsWith('gemini')) {
      const streamResult = await vertexAIService.getStreamingResponse(messages, modelId, systemPrompt);
      const onComplete = (usage: any) => {
        if (modelId === GEMINI_2_5_PRO_MODEL_ID) {
          usageTracker.updateUsage(usage.promptTokenCount, usage.candidatesTokenCount).catch(console.error);
        }
      };
      const transformedStream = vertexAIStreamTransformer(streamResult.stream, onComplete);
      readableStream = toReadableStream(transformedStream);

    } else if (modelId.startsWith('gpt') || modelId.startsWith('o1') || modelId.startsWith('o3')) {
      const stream = await openAIService.getStreamingResponse(messages, modelId, systemPrompt);
      const transformedStream = openAIStreamTransformer(stream);
      readableStream = toReadableStream(transformedStream);

    } else if (modelId.startsWith('claude')) {
      const stream = await anthropicService.getStreamingResponse(messages, modelId, systemPrompt);
      const transformedStream = anthropicStreamTransformer(stream);
      readableStream = toReadableStream(transformedStream);

    } else {
      return NextResponse.json({ error: `Model ${modelId} not supported yet.` }, { status: 400 });
    }

    return new Response(readableStream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });

  } catch (error) {
    console.error('Error in chat API:', error);
    const errorMessage = error instanceof Error ? error.message : 'An internal server error occurred.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}


