import { NextRequest, NextResponse } from 'next/server';
import { CoreMessage, streamText, generateObject } from 'ai';
import { getOpenAIProvider } from '@/services/openai';
import { getAnthropicProvider } from '@/services/anthropic';
import { getGoogleProvider } from '@/services/vertexai';
import { firestore } from '@/services/firestore';
import { FieldValue } from '@google-cloud/firestore';
import { getModelsConfig } from '@/config/modelConfig';
import { get_encoding } from 'tiktoken';
import { z } from 'zod';
import { searchOnGoogle, SearchResult } from '@/services/googleSearch';

interface ChatRequestBody {
  messages: CoreMessage[];
  modelId: string;
  systemPrompt?: string;
  temperaturePreset?: 'precise' | 'balanced' | 'creative';
  maxTokens?: number;
  reasoningPreset?: 'low' | 'middle' | 'high';
  webSearchEnabled?: boolean;
}



const TEMP_PRESET_MAP: { [key: string]: number } = {
  precise: 0.2,
  balanced: 0.6,
  creative: 1.0,
};

const REASONING_PRESET_TO_TEMP: { [key: string]: number } = {
  low: 0.1,
  middle: 0.5,
  high: 1.0,
};

const enc = get_encoding('cl100k_base');

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
    const { messages, modelId, systemPrompt, temperaturePreset, maxTokens, reasoningPreset, webSearchEnabled } = body;

    if (!messages || !modelId) {
      return NextResponse.json({ error: 'messages and modelId are required' }, { status: 400 });
    }

                                    const { monthlyLimitsUSD, pricingPerMillionTokensUSD } = await getModelsConfig();

    const limit = monthlyLimitsUSD[modelId];
    if (limit) {
      const usage = await usageTracker.getUsage(modelId);
      if (usage.total_cost >= limit) {
        return NextResponse.json({ error: `Monthly usage limit of $${limit} for ${modelId} has been reached.` }, { status: 429 });
      }
    }

    const onFinishCallback = async (result: { usage?: { promptTokens: number; completionTokens: number }; text?: string; [key: string]: unknown; }) => {
        try {
            let promptTokens = 0;
            let completionTokens = 0;
            if (modelId.startsWith('gpt') || modelId.startsWith('o')) {
                const inputText = messages.map(m => Array.isArray(m.content) ? m.content.filter(c => c.type === 'text').map(c => c.text).join('\n') : m.content).join('\n');
                promptTokens = enc.encode(inputText).length;
                completionTokens = result.text ? enc.encode(result.text).length : 0;
            } else {
                const usage = result.usage;
                if (!usage) return;
                promptTokens = usage.promptTokens;
                completionTokens = usage.completionTokens;
            }
                        const pricing = pricingPerMillionTokensUSD[modelId];
            if (!pricing) {
                console.warn(`No pricing info for model ${modelId}. Skipping usage update.`);
                return;
            }
            await usageTracker.updateUsage(modelId, promptTokens, completionTokens, pricing);
        } catch (error) {
            console.error(`[FATAL ERROR] An unexpected error occurred inside onFinish for ${modelId}:`, error);
        }
    };

    let finalTemperature;
    if (reasoningPreset) {
      finalTemperature = REASONING_PRESET_TO_TEMP[reasoningPreset];
    } else if (temperaturePreset) {
      finalTemperature = TEMP_PRESET_MAP[temperaturePreset];
    }

    if (modelId === 'o3' && webSearchEnabled) {
      // Step 1: Generate a search query from the user's last message.
      const lastMessage = messages[messages.length - 1];
      const { object: { query } } = await generateObject({
        model: getOpenAIProvider()(modelId),
        schema: z.object({
          query: z.string().describe('A concise and effective search query based on the user prompt.'),
        }),
        prompt: `Based on the following user prompt, what is the most relevant and effective search query to find up-to-date information? User Prompt: \"${lastMessage.content}\"`,
      });

      // Step 2: Perform the web search.
      const searchResults = await searchOnGoogle(query);
      
      // Step 3: Generate the final answer based on the search results and user's persona.
      const persona = systemPrompt ? `${systemPrompt}\n\n---\n\n` : '';
      const researchInstructions = `You are an expert research assistant. Your goal is to provide a comprehensive, well-structured answer to the user's question based *only* on the provided search results. \n\nINSTRUCTIONS:\n1. Synthesize the information from the search results to formulate a single, coherent answer.\n2. Do not mention that you are using search results (e.g., \"According to the search results...\"). Act as if you know the information innately.\n3. At the end of your answer, create a new section titled \"参考資料\".\n4. In this section, list the titles of the web pages you used to formulate your answer, and make each title a hyperlink to its corresponding URL using Markdown format.\n   Example:\n   ### 参考資料\n   - [東京の天気 - ウェザーニュース](https://weathernews.jp/onebox/tenki/tokyo/)\n   - [東京都の天気 - 日本気象協会 tenki.jp](https://tenki.jp/forecast/3/16/)\n5. If the search results are empty or do not contain relevant information, simply state: \"申し訳ありませんが、関連情報を見つけることができませんでした。\"\n\nSEARCH RESULTS (for your reference only):\n---\n${searchResults.map((item: SearchResult, index: number) => `[${index + 1}] Title: ${item.title}\nSnippet: ${item.snippet}\nURL: ${item.link}`).join('\n\n') || 'No results found.'}\n---\n`;

      const finalSystemPrompt = `${persona}${researchInstructions}`;

      const result = await streamText({
        messages: messages,
        system: finalSystemPrompt,
        model: getOpenAIProvider()(modelId),
        temperature: finalTemperature,
        maxTokens: maxTokens,
        onFinish: onFinishCallback,
      });
      return result.toDataStreamResponse();

    } else {
      // --- Default flow for all other cases ---
      const streamTextConfig = {
        messages: messages,
        system: systemPrompt,
        temperature: finalTemperature,
        maxTokens: maxTokens,
        onFinish: onFinishCallback,
      };

      if (modelId.startsWith('gpt') || modelId.startsWith('o')) {
          const result = await streamText({ ...streamTextConfig, model: getOpenAIProvider()(modelId) });
          return result.toDataStreamResponse();
      } else if (modelId.startsWith('claude')) {
          const claudeModelMap: { [key: string]: string } = { 'claude-sonnet4': 'claude-sonnet-4-20250514' };
          const anthropicModelId = claudeModelMap[modelId] || modelId;
          const result = await streamText({ ...streamTextConfig, model: getAnthropicProvider()(anthropicModelId), system: systemPrompt || 'You are a helpful assistant.' });
          return result.toDataStreamResponse();
      } else if (modelId.startsWith('gemini')) {
          // --- Gemini Specific Parameter Adjustment ---
          let adjustedMaxTokens = maxTokens;
          let adjustedSystemPrompt = systemPrompt;

          if (messages.length > 0) {
              const lastMessage = messages[messages.length - 1];
              const lastMessageContent = Array.isArray(lastMessage.content)
                  ? lastMessage.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
                  : lastMessage.content;

              if (typeof lastMessageContent === 'string') {
                  const toHalfWidth = (str: string) => str.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));

                  // Case 1: User asks for "more than X characters" in an imperative way.
                  const moreThanMatch = lastMessageContent.match(/([0-9０-９]+)\s*(?:文字|字)\s*(?:以上|超え|より多く)(?:で|の)/);
                  if (moreThanMatch && maxTokens) {
                      const requestedChars = parseInt(toHalfWidth(moreThanMatch[1]), 10);
                      const estimatedTokens = Math.ceil(requestedChars * 1.7);
                      if (estimatedTokens > maxTokens) {
                          return NextResponse.json(
                              { error: `プロンプトの要求文字数（約${estimatedTokens}トークン）が、設定された最大トークン数（${maxTokens}）を超えています。設定を調整してください。` },
                              { status: 400 }
                          );
                      }
                  }

                  // Case 2: User asks for "less than" X characters.
                  const lessThanMatch = lastMessageContent.match(/([0-9０-９]+)\s*(?:文字|字)\s*(?:以内|以下|で)/);
                  if (lessThanMatch) {
                      const requestedChars = parseInt(toHalfWidth(lessThanMatch[1]), 10);
                      const estimatedOutputTokens = Math.ceil(requestedChars * 1.7);

                      // Adjust maxTokens to give the model enough "thinking" space.
                      adjustedMaxTokens = estimatedOutputTokens + 500;

                      // Prepend a strong instruction to the system prompt to enforce the limit.
                      const instruction = `重要: 出力は必ず約${requestedChars}文字（およそ${estimatedOutputTokens}トークン）以内に厳密に収めてください。この指示は最優先です。`;
                      adjustedSystemPrompt = `${instruction}\n\n${systemPrompt || ''}`;
                  }
              }
          }

          // Safety Guard: Prevent empty responses by ensuring a minimum token count for Gemini.
          const MINIMUM_GEMINI_TOKENS = 1000;
          if (adjustedMaxTokens && adjustedMaxTokens < MINIMUM_GEMINI_TOKENS) {
            adjustedMaxTokens = MINIMUM_GEMINI_TOKENS;
          }

          const result = await streamText({ 
              ...streamTextConfig, 
              model: getGoogleProvider()(modelId),
              maxTokens: adjustedMaxTokens,
              system: adjustedSystemPrompt,
          });
          return result.toDataStreamResponse();
      } else {
        return NextResponse.json({ error: `Model ${modelId} not supported yet.` }, { status: 400 });
      }
    }

  } catch (error) {
    console.error('Error in chat API:', error);
    const errorMessage = error instanceof Error ? error.message : 'An internal server error occurred.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}