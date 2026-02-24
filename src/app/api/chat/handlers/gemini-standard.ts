import { NextResponse } from 'next/server';
import { CoreMessage } from 'ai';
import { encodeTextChunk, encodeError, encodeFinish } from '@/utils/sse-encoder';
import { formatApiError } from '@/utils/api-error';
import { updateUsage } from '@/utils/usage-tracker';
import type { HandlerParams, ChatRequestBody } from '../types';

/** Handle Gemini 2.5 Pro/Flash */
export async function handleGeminiStandard(
  params: HandlerParams,
  body: ChatRequestBody,
  messages: CoreMessage[],
): Promise<Response> {
  const { modelId, processedMessages, systemPrompt, finalTemperature, maxTokens, pricingPerMillionTokensUSD } = params;
  const { geminiGroundingEnabled } = body;

  // --- Japanese character count adjustment logic ---
  let adjustedMaxTokens = maxTokens;
  let adjustedSystemPrompt = systemPrompt;

  if (messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    const lastMessageContent = Array.isArray(lastMessage.content)
      ? lastMessage.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
      : lastMessage.content;

    if (typeof lastMessageContent === 'string') {
      const toHalfWidth = (str: string) => str.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));

      const moreThanMatch = lastMessageContent.match(/([0-9０-９]+)\s*(?:文字|字)\s*(?:以上|超え|より多く)(?:で|の)/);
      if (moreThanMatch && maxTokens) {
        const requestedChars = parseInt(toHalfWidth(moreThanMatch[1]), 10);
        const estimatedTokens = Math.ceil(requestedChars * 1.7);
        if (estimatedTokens > maxTokens) {
          return NextResponse.json(
            { error: `プロンプトの要求文字数（約${estimatedTokens}トークン）が、設定された最大トークン数（${maxTokens}）を超えています。設定を調整してください。` },
            { status: 400 },
          );
        }
      }

      const lessThanMatch = lastMessageContent.match(/([0-9０-９]+)\s*(?:文字|字)\s*(?:以内|以下|で)/);
      if (lessThanMatch) {
        const requestedChars = parseInt(toHalfWidth(lessThanMatch[1]), 10);
        const estimatedOutputTokens = Math.ceil(requestedChars * 1.7);
        adjustedMaxTokens = estimatedOutputTokens + 500;
        const instruction = `重要: 出力は必ず約${requestedChars}文字（およそ${estimatedOutputTokens}トークン）以内に厳密に収めてください。この指示は最優先です。`;
        adjustedSystemPrompt = `${instruction}\n\n${systemPrompt || ''}`;
      }
    }
  }

  const MINIMUM_GEMINI_TOKENS = 2000;
  if (adjustedMaxTokens && adjustedMaxTokens < MINIMUM_GEMINI_TOKENS) {
    adjustedMaxTokens = MINIMUM_GEMINI_TOKENS;
  }

  // Official @google-cloud/vertexai SDK
  const { VertexAI } = await import('@google-cloud/vertexai');
  const vertexAI = new VertexAI({
    project: process.env.LLM_GCP_GOOGLE_CLOUD_PROJECT_ID!,
    location: process.env.LLM_GCP_GOOGLE_CLOUD_LOCATION!,
  });

  const geminiTools = geminiGroundingEnabled
    ? [{ googleSearchRetrieval: {} }]
    : undefined;

  const geminiModel = vertexAI.getGenerativeModel({
    model: modelId,
    generationConfig: {
      temperature: finalTemperature ?? 0.6,
      maxOutputTokens: adjustedMaxTokens ?? 65536,
    },
    tools: geminiTools as Parameters<typeof vertexAI.getGenerativeModel>[0]['tools'],
    systemInstruction: adjustedSystemPrompt ? { role: 'system', parts: [{ text: adjustedSystemPrompt }] } : undefined,
  });

  // Convert messages to Vertex AI format
  const geminiContents = processedMessages.map(m => {
    if (typeof m.content === 'string') {
      return { role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts = (m.content as any[]).map((part: any) => {
      if (part.type === 'text' && 'text' in part && typeof part.text === 'string') {
        return { text: part.text };
      } else if (part.type === 'image' && 'image' in part && typeof part.image === 'string') {
        const matches = (part.image as string).match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          return { inlineData: { mimeType: matches[1], data: matches[2] } };
        }
      } else if (part.type === 'pdf' && part.pdf) {
        const matches = (part.pdf as string).match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          return { inlineData: { mimeType: matches[1], data: matches[2] } };
        }
      }
      return { text: '' };
    }).filter((p: Record<string, unknown>) => 'text' in p ? p.text !== '' : true);
    return { role: m.role === 'user' ? 'user' : 'model', parts };
  });

  const geminiStreamResult = await geminiModel.generateContentStream({ contents: geminiContents });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        for await (const chunk of geminiStreamResult.stream) {
          if (chunk.usageMetadata) {
            totalInputTokens = chunk.usageMetadata.promptTokenCount || 0;
            totalOutputTokens = chunk.usageMetadata.candidatesTokenCount || 0;
          }
          if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
            for (const part of chunk.candidates[0].content.parts) {
              if (part.text) {
                controller.enqueue(encodeTextChunk(part.text));
              }
            }
          }
        }

        const pricing = pricingPerMillionTokensUSD[modelId];
        if (pricing && (totalInputTokens > 0 || totalOutputTokens > 0)) {
          await updateUsage(modelId, totalInputTokens, totalOutputTokens, pricing);
        }
        controller.enqueue(encodeFinish());
        controller.close();
      } catch (error) {
        console.error(`[ERROR] Gemini 2.5 stream error for ${modelId}:`, error);
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
