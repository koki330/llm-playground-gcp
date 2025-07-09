import { NextRequest, NextResponse } from 'next/server';
import { getAiStream } from '@/lib/ai';
import { SUPPORTED_MODELS } from '@/lib/ai/models';
import { downloadFromGcs } from '@/lib/gcs';
import { parseFileContent } from '@/lib/file-parser';
import { trackUsage, getMonthlyCosts, updateMonthlyCosts } from '@/lib/firestore';

const sendToClient = (global as any).sendToClient;
const GEMINI_2_5_PRO_MODEL_ID = 'gemini-2.5-pro-001';
const COST_LIMIT = 300;

// ... (handleFileProcessing function remains the same) ...
async function handleFileProcessing(fileUrl: string, contentType: string): Promise<string> {
  const gcsBucketName = process.env.GCS_BUCKET_NAME;
  if (!gcsBucketName) throw new Error('GCS_BUCKET_NAME is not set.');
  const fileName = fileUrl.split('/').pop() || '';
  const fileBuffer = await downloadFromGcs(gcsBucketName, fileName);
  let fileText = await parseFileContent(fileBuffer, contentType);
  if (fileText.length > 150000) {
    const prefix = fileText.substring(0, 100000);
    const suffix = fileText.substring(fileText.length - 50000);
    fileText = `--- FILE CONTENT (TRUNCATED) ---
${prefix}
[...omitted...]
${suffix}
--- END OF FILE CONTENT ---
`;
  }
  return fileText;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, modelId, clientId, fileUrl, contentType } = body;

    if (!prompt || !modelId || !clientId) {
      return NextResponse.json({ error: 'prompt, modelId, and clientId are required' }, { status: 400 });
    }

    const model = SUPPORTED_MODELS.find(m => m.id === modelId);
    if (!model) {
      return NextResponse.json({ error: `Unsupported model: ${modelId}` }, { status: 400 });
    }

    // --- Cost Limit Check for Gemini 2.5 Pro ---
    if (modelId === GEMINI_2_5_PRO_MODEL_ID) {
      const costs = await getMonthlyCosts();
      if (costs.gemini_2_5_pro_cost >= COST_LIMIT) {
        return NextResponse.json({ error: '今月の上限に達したため、このモデルは利用できません' }, { status: 429 });
      }
    }

    if (!sendToClient) {
      return NextResponse.json({ error: 'WebSocket server not available.' }, { status: 500 });
    }

    (async () => {
      try {
        let finalPrompt = prompt;
        if (fileUrl && contentType) {
          const fileText = await handleFileProcessing(fileUrl, contentType);
          finalPrompt = `File content:
${fileText}

User prompt: ${prompt}`;
        }

        const stream = await getAiStream(modelId, finalPrompt);

        for await (const chunk of stream) {
          let text = '';
          switch (model.provider) {
            case 'gemini': text = chunk.text(); break;
            case 'anthropic': if (chunk.type === 'content_block_delta') text = chunk.delta.text; break;
            case 'openai': text = chunk.choices[0]?.delta?.content || ''; break;
          }
          if (text) sendToClient(clientId, JSON.stringify({ type: 'chunk', data: text }));
        }

        sendToClient(clientId, JSON.stringify({ type: 'end' }));

        let usage = { inputTokens: 0, outputTokens: 0 };
        // ... (logic to get usage from stream) ...
        await trackUsage(modelId, usage.inputTokens, usage.outputTokens);

        if (model.id === GEMINI_2_5_PRO_MODEL_ID && model.pricing) {
          const cost = (usage.inputTokens * model.pricing.input) + (usage.outputTokens * model.pricing.output);
          await updateMonthlyCosts({ gemini_cost_increase: cost, total_cost_increase: cost });
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown streaming error';
        sendToClient(clientId, JSON.stringify({ type: 'error', error: errorMsg }));
      }
    })();

    return NextResponse.json({ message: 'Streaming started' }, { status: 202 });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to start chat session', details: errorMsg }, { status: 500 });
  }
}