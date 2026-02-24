import { Storage } from '@google-cloud/storage';
import { NextRequest, NextResponse } from 'next/server';
import { getModelsConfig } from '@/config/modelConfig';
import { getUsage } from '@/utils/usage-tracker';
import { handleOpenAIStandard } from './handlers/openai-standard';
import { handleGpt5 } from './handlers/openai-gpt5';
import { handleClaude } from './handlers/claude';
import { handleGeminiStandard } from './handlers/gemini-standard';
import { handleGemini3 } from './handlers/gemini3';
import type { ChatRequestBody, AppMessage } from './types';

const TEMP_PRESET_MAP: { [key: string]: number } = {
  precise: 0.2,
  balanced: 0.6,
  creative: 1.0,
};

export async function POST(req: NextRequest) {
  try {
    const body: ChatRequestBody = await req.json();
    const { messages, modelId, systemPrompt, temperaturePreset, maxTokens } = body;

    if (!messages || !modelId) {
      return NextResponse.json({ error: 'messages and modelId are required' }, { status: 400 });
    }

    const processedMessages: AppMessage[] = messages.map(msg => ({ ...msg }));

    // --- Image processing (download from GCS, convert to base64 data URLs) ---
    const imagesToProcess = body.imageUris ?? [];
    if (imagesToProcess.length > 0) {
      try {
        const storage = new Storage();
        const lastUserMessage = processedMessages.findLast(m => m.role === 'user');

        if (lastUserMessage) {
          const textContent = typeof lastUserMessage.content === 'string' ? lastUserMessage.content : '';
          const newContent: Array<{ type: 'image'; image: string } | { type: 'text'; text: string }> = [];

          for (const uri of imagesToProcess) {
            const [bucket, ...fileParts] = uri.replace('gs://', '').split('/');
            const fileName = fileParts.join('/');
            const [fileBuffer] = await storage.bucket(bucket).file(fileName).download();
            const [metadata] = await storage.bucket(bucket).file(fileName).getMetadata();
            const mime = metadata?.contentType || 'image/png';
            const dataUrl = `data:${mime};base64,${fileBuffer.toString('base64')}`;
            newContent.push({ type: 'image', image: dataUrl });
          }

          newContent.push({ type: 'text', text: textContent });
          (lastUserMessage as { content: unknown }).content = newContent;

          if ('parts' in (lastUserMessage as Record<string, unknown>)) {
            delete (lastUserMessage as Record<string, unknown>).parts;
          }
        }
      } catch (e) {
        console.error('[ERROR] Failed during GCS image processing:', e);
      }
    }

    // --- PDF processing (download from GCS, convert to base64 data URLs) ---
    const pdfsToProcess = body.pdfUris ?? [];
    if (pdfsToProcess.length > 0) {
      try {
        const storage = new Storage();
        const lastUserMessage = processedMessages.findLast(m => m.role === 'user');
        if (lastUserMessage) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const contentArray: any[] = Array.isArray(lastUserMessage.content)
            ? [...lastUserMessage.content]
            : [{ type: 'text', text: (lastUserMessage.content as string) || '' }];

          for (const uri of pdfsToProcess) {
            const [bucket, ...fileParts] = uri.replace('gs://', '').split('/');
            const fileName = fileParts.join('/');
            const [fileBuffer] = await storage.bucket(bucket).file(fileName).download();
            const dataUrl = `data:application/pdf;base64,${fileBuffer.toString('base64')}`;
            contentArray.unshift({ type: 'pdf', pdf: dataUrl });
          }

          (lastUserMessage as { content: unknown }).content = contentArray;

          if ('parts' in (lastUserMessage as Record<string, unknown>)) {
            delete (lastUserMessage as Record<string, unknown>).parts;
          }
        }
      } catch (e) {
        console.error('[ERROR] Failed during GCS PDF processing:', e);
      }
    }

    // --- File contents processing (Word, Excel, etc. — inject extracted text into prompt) ---
    const fileContentsToProcess = body.fileContents ?? [];
    if (fileContentsToProcess.length > 0) {
      const lastUserMessage = processedMessages.findLast(m => m.role === 'user');
      if (lastUserMessage) {
        const originalText = typeof lastUserMessage.content === 'string'
          ? lastUserMessage.content
          : Array.isArray(lastUserMessage.content)
            ? (lastUserMessage.content.find((c: { type: string }) => c.type === 'text') as { text?: string })?.text || ''
            : '';
        const filesText = fileContentsToProcess.map(fc =>
          `[File: ${fc.name}]\n${fc.content}`
        ).join('\n\n---\n\n');
        const combinedText = `The user has uploaded ${fileContentsToProcess.length} file(s). Their contents are:\n\n${filesText}\n\n---\n\nUser prompt:\n\n${originalText}`;

        if (Array.isArray(lastUserMessage.content)) {
          const textPart = lastUserMessage.content.find((c: { type: string }) => c.type === 'text') as { text?: string } | undefined;
          if (textPart) {
            textPart.text = combinedText;
          }
        } else {
          (lastUserMessage as { content: unknown }).content = combinedText;
        }
      }
    }

    // --- Usage limit check ---
    const { monthlyLimitsUSD, pricingPerMillionTokensUSD } = await getModelsConfig();
    const limit = monthlyLimitsUSD[modelId];
    if (limit) {
      const usage = await getUsage(modelId);
      const usagePercentage = (usage.total_cost / limit) * 100;

      if (usagePercentage >= 100) {
        return NextResponse.json(
          { error: `【利用上限超過】\n\nモデル「${modelId}」は、月間の利用上限額（${limit}）に達したため、現在ご利用いただけません。\n\n管理者にご確認ください。` },
          { status: 429 },
        );
      }

      if (usagePercentage >= 80) {
        console.log(`[USAGE WARNING] Model ${modelId} has reached ${usagePercentage.toFixed(0)}% of its monthly usage limit (${limit}).`);
      }
    }

    // --- Temperature resolution ---
    const finalTemperature = temperaturePreset ? TEMP_PRESET_MAP[temperaturePreset] : undefined;

    const handlerParams = {
      modelId,
      processedMessages,
      systemPrompt,
      finalTemperature,
      maxTokens,
      pricingPerMillionTokensUSD,
    };

    // --- Model routing ---
    const { modelConfig } = await getModelsConfig();
    const selectedModelConfig = modelConfig[modelId];

    if (selectedModelConfig?.service === 'gpt5') {
      return handleGpt5(handlerParams, body);
    }

    if (modelId.startsWith('gpt')) {
      return handleOpenAIStandard(handlerParams);
    }

    if (modelId === 'claude-sonnet-4-5') {
      return handleClaude(handlerParams);
    }

    if (modelId === 'gemini-3-pro-preview') {
      return handleGemini3(handlerParams, body);
    }

    if (modelId.startsWith('gemini')) {
      return handleGeminiStandard(handlerParams, body, messages);
    }

    return NextResponse.json({ error: `Model ${modelId} not supported yet.` }, { status: 400 });

  } catch (error) {
    console.error('Error in chat API:', error);
    const errorMessage = error instanceof Error ? error.message : 'An internal server error occurred.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
