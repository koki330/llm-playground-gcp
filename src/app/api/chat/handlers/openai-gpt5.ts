import { streamGpt5Response } from '@/services/openai-gpt5';
import { encodeError, encodeFinish } from '@/utils/sse-encoder';
import { formatApiError } from '@/utils/api-error';
import { updateUsage } from '@/utils/usage-tracker';
import type { HandlerParams, ChatRequestBody } from '../types';

/** Handle GPT-5 series models */
export async function handleGpt5(
  params: HandlerParams,
  body: ChatRequestBody,
): Promise<Response> {
  const { modelId, processedMessages, systemPrompt, pricingPerMillionTokensUSD } = params;
  const { gpt5ReasoningEffort, gpt5Verbosity, gpt5GroundingEnabled } = body;

  const pricing = pricingPerMillionTokensUSD[modelId];

  try {
    const stream = await streamGpt5Response({
      model: modelId,
      messages: processedMessages as Array<{ role: string; content: string | Array<{ type: string; text?: string; image?: string }> }>,
      reasoning: gpt5ReasoningEffort || 'low',
      verbosity: gpt5Verbosity || 'low',
      groundingEnabled: gpt5GroundingEnabled || false,
      systemPrompt: systemPrompt,
      onUsage: async (usage) => {
        if (!pricing) return;
        const inT = usage.input_tokens ?? usage.input_text_tokens ?? 0;
        const outT = usage.output_tokens ?? usage.output_text_tokens ?? 0;
        await updateUsage(modelId, inT, outT, pricing);
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error) {
    console.error(`[ERROR] GPT-5 handler error for ${modelId}:`, error);
    const errorStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encodeError(formatApiError(error)));
        controller.enqueue(encodeFinish('error'));
        controller.close();
      },
    });
    return new Response(errorStream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
