import { streamGemini3Response } from '@/services/vertexai-gemini3';
import { encodeError, encodeFinish } from '@/utils/sse-encoder';
import { formatApiError } from '@/utils/api-error';
import { updateUsage } from '@/utils/usage-tracker';
import type { HandlerParams, ChatRequestBody } from '../types';

/** Handle Gemini 3 Pro Preview */
export async function handleGemini3(
  params: HandlerParams,
  body: ChatRequestBody,
): Promise<Response> {
  const { modelId, processedMessages, systemPrompt, finalTemperature, maxTokens, pricingPerMillionTokensUSD } = params;
  const { gemini3ThinkingLevel, geminiGroundingEnabled } = body;

  const pricing = pricingPerMillionTokensUSD[modelId];

  try {
    const stream = await streamGemini3Response({
      model: modelId,
      messages: processedMessages.map(m => {
        let content: string | Array<{type: string; text?: string; image?: string; pdf?: string}>;
        if (typeof m.content === 'string') {
          content = m.content;
        } else if (Array.isArray(m.content)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content = (m.content as any[]).map((part: any) => {
            if ('text' in part && typeof part.text === 'string') {
              return { type: 'text', text: part.text };
            } else if (part.type === 'pdf' && part.pdf) {
              return { type: 'pdf', pdf: part.pdf as string };
            } else if ('image' in part) {
              const imageData = typeof part.image === 'string' ? part.image : '';
              return { type: 'image', image: imageData };
            }
            return { type: 'text', text: '' };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }).filter((p: any) => p.text || p.image || p.pdf);
        } else {
          content = '';
        }
        return { role: m.role, content };
      }),
      systemPrompt,
      temperature: finalTemperature,
      maxTokens,
      thinkingLevel: gemini3ThinkingLevel || 'high',
      groundingEnabled: geminiGroundingEnabled || false,
      onUsageUpdate: pricing ? async (inputTokens: number, outputTokens: number) => {
        await updateUsage(modelId, inputTokens, outputTokens, pricing);
      } : undefined,
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error) {
    console.error(`[ERROR] Gemini 3 handler error for ${modelId}:`, error);
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
