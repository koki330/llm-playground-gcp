import OpenAI from 'openai';
import { encodeTextChunk, encodeError, encodeFinish } from '@/utils/sse-encoder';
import { formatApiError } from '@/utils/api-error';
import { updateUsage } from '@/utils/usage-tracker';
import type { HandlerParams, AppMessage } from '../types';

function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.LLM_GCP_OPENAI_API_KEY! });
}

function toOpenAIMessages(
  processedMessages: AppMessage[],
  systemPrompt?: string,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const msgs: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
  for (const m of processedMessages) {
    if (m.role === 'user') {
      if (typeof m.content === 'string') {
        msgs.push({ role: 'user', content: m.content });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parts: any[] = m.content.map((p: any) => {
          if (p.type === 'image' && 'image' in p && typeof p.image === 'string') {
            return { type: 'image_url' as const, image_url: { url: p.image } };
          }
          if (p.type === 'pdf' && 'pdf' in p) {
            return { type: 'file', file: { filename: 'document.pdf', file_data: p.pdf } };
          }
          return { type: 'text' as const, text: ('text' in p && typeof p.text === 'string') ? p.text : '' };
        });
        msgs.push({ role: 'user', content: parts });
      }
    } else if (m.role === 'assistant') {
      const text = typeof m.content === 'string' ? m.content : m.content.filter(p => p.type === 'text').map(p => ('text' in p ? p.text : '')).join('');
      msgs.push({ role: 'assistant', content: text });
    }
  }
  return msgs;
}

/** Handle GPT-4.1 */
export async function handleOpenAIStandard(params: HandlerParams): Promise<Response> {
  const { modelId, processedMessages, systemPrompt, finalTemperature, maxTokens, pricingPerMillionTokensUSD } = params;
  const client = getOpenAIClient();

  const openaiStream = await client.chat.completions.create({
    model: modelId,
    messages: toOpenAIMessages(processedMessages, systemPrompt),
    temperature: finalTemperature,
    max_tokens: maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let inputTokens = 0;
        let outputTokens = 0;
        for await (const chunk of openaiStream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            controller.enqueue(encodeTextChunk(delta));
          }
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens;
            outputTokens = chunk.usage.completion_tokens;
          }
        }
        const pricing = pricingPerMillionTokensUSD[modelId];
        if (pricing) {
          await updateUsage(modelId, inputTokens, outputTokens, pricing);
        }
        controller.enqueue(encodeFinish());
        controller.close();
      } catch (error) {
        console.error(`[ERROR] OpenAI stream error for ${modelId}:`, error);
        controller.enqueue(encodeError(formatApiError(error)));
        controller.enqueue(encodeFinish('error'));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export { getOpenAIClient, toOpenAIMessages };
