import { encodeTextChunk, encodeError, encodeFinish } from '@/utils/sse-encoder';
import { formatApiError } from '@/utils/api-error';
import { updateUsage } from '@/utils/usage-tracker';
import type { HandlerParams } from '../types';

/** Handle Claude Sonnet 4.5 */
export async function handleClaude(params: HandlerParams): Promise<Response> {
  const { modelId, processedMessages, systemPrompt, finalTemperature, maxTokens, pricingPerMillionTokensUSD } = params;

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const anthropic = new Anthropic({
    apiKey: process.env.LLM_GCP_ANTHROPIC_API_KEY,
  });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicStream = await anthropic.messages.stream({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: maxTokens || 64000,
          temperature: finalTemperature || 0.6,
          system: systemPrompt || 'You are a helpful assistant.',
          messages: processedMessages.map(m => {
            if (Array.isArray(m.content)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const anthropicContent: any[] = [];

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              for (const part of m.content as any[]) {
                if (part.type === 'text' && 'text' in part) {
                  anthropicContent.push({ type: 'text', text: part.text });
                } else if (part.type === 'image' && 'image' in part && typeof part.image === 'string') {
                  const dataUrl = part.image;
                  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                  if (matches) {
                    const extractedType = matches[1];
                    const base64Data = matches[2];

                    let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/png';
                    if (base64Data.startsWith('/9j/')) {
                      mediaType = 'image/jpeg';
                    } else if (base64Data.startsWith('iVBORw0KGgo')) {
                      mediaType = 'image/png';
                    } else if (base64Data.startsWith('R0lGOD')) {
                      mediaType = 'image/gif';
                    } else if (base64Data.startsWith('UklGR')) {
                      mediaType = 'image/webp';
                    } else if (extractedType === 'image/jpeg' || extractedType === 'image/png' ||
                        extractedType === 'image/gif' || extractedType === 'image/webp') {
                      mediaType = extractedType;
                    }

                    anthropicContent.push({
                      type: 'image',
                      source: { type: 'base64', media_type: mediaType, data: base64Data },
                    });
                  }
                } else if (part.type === 'pdf' && part.pdf) {
                  const pdfDataUrl = part.pdf as string;
                  const matches = pdfDataUrl.match(/^data:([^;]+);base64,(.+)$/);
                  if (matches) {
                    anthropicContent.push({
                      type: 'document',
                      source: { type: 'base64', media_type: 'application/pdf', data: matches[2] },
                    });
                  }
                }
              }

              return { role: m.role as 'user' | 'assistant', content: anthropicContent };
            }

            return {
              role: m.role as 'user' | 'assistant',
              content: typeof m.content === 'string' ? m.content : '',
            };
          }) as Parameters<typeof anthropic.messages.stream>[0]['messages'],
        });

        let inputTokens = 0;
        let outputTokens = 0;

        for await (const event of anthropicStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encodeTextChunk(event.delta.text));
          } else if (event.type === 'message_start') {
            inputTokens = event.message.usage.input_tokens;
          } else if (event.type === 'message_delta') {
            outputTokens = event.usage.output_tokens;
          }
        }

        const pricing = pricingPerMillionTokensUSD[modelId];
        if (pricing) {
          await updateUsage(modelId, inputTokens, outputTokens, pricing);
        }

        controller.enqueue(encodeFinish());
        controller.close();
      } catch (error) {
        console.error('[ERROR] Claude Sonnet 4.5 error:', error);
        controller.enqueue(encodeError(formatApiError(error)));
        controller.enqueue(encodeFinish('error'));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' },
  });
}
