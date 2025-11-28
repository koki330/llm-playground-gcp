import { Storage } from '@google-cloud/storage';
import { NextRequest, NextResponse } from 'next/server';
import { CoreMessage, streamText, generateObject } from 'ai';
import { getOpenAIProvider } from '@/services/openai';
import { getAnthropicProvider } from '@/services/anthropic';
import { getGoogleProvider } from '@/services/vertexai';
import { streamGpt5Response } from '@/services/openai-gpt5';
import { streamGemini3Response } from '@/services/vertexai-gemini3';
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
  imageUri?: string; // Added for image URI
  gpt5ReasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  gpt5Verbosity?: 'low' | 'medium' | 'high';
  gpt5GroundingEnabled?: boolean;
  gemini3ThinkingLevel?: 'low' | 'high';
}

// Extend CoreMessage to include an optional 'parts' property for type safety
type AppMessage = CoreMessage & {
  parts?: { type: string; text: string }[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}
function isTextPart(p: unknown): p is { type: "text"; text: string } {
    return isRecord(p) && p.type === "text" && typeof p.text === "string";
}
function isImagePart(p: unknown): p is { type: "image"; image: string } {
    return isRecord(p) && p.type === "image" && typeof p.image === "string";
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
        await docRef.set({ 
          total_cost: 0, 
          total_input_tokens: 0,
          total_output_tokens: 0,
          year_month, 
          daily_costs: {},
          daily_input_tokens: {},
          daily_output_tokens: {},
          last_updated: lastUpdatedTimestamp 
        });
        return { total_cost: 0, total_input_tokens: 0, total_output_tokens: 0, year_month };
      }
      return doc.data() as { total_cost: number; total_input_tokens: number; total_output_tokens: number; year_month: string };
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
        const currentMonth = new Date().toISOString().slice(0, 7);

        const doc = await docRef.get();
        if (doc.exists) {
            // Document exists, check for monthly reset
            const docData = doc.data();
            if (docData && docData.year_month && docData.year_month !== currentMonth) {
                // It's a new month, reset the costs.
                await docRef.set({
                    total_cost: 0,
                    total_input_tokens: 0,
                    total_output_tokens: 0,
                    year_month: currentMonth,
                    daily_costs: {},
                    daily_input_tokens: {},
                    daily_output_tokens: {},
                    last_updated: ''
                });
            }
            // If year_month is missing or matches current month, do nothing. Let the update proceed.
        } else {
            // Document does not exist, create it.
            await docRef.set({
                total_cost: 0,
                total_input_tokens: 0,
                total_output_tokens: 0,
                year_month: currentMonth,
                daily_costs: {},
                daily_input_tokens: {},
                daily_output_tokens: {},
                last_updated: ''
            });
        }

        const today = new Date().toISOString().slice(0, 10);
        const dailyCostField = `daily_costs.${today}`;
        const dailyInputTokensField = `daily_input_tokens.${today}`;
        const dailyOutputTokensField = `daily_output_tokens.${today}`;
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const lastUpdatedTimestamp = `${year}/${month}/${day}/${hours}:${minutes}`;
        
        await docRef.update({
          total_cost: FieldValue.increment(requestCost),
          total_input_tokens: FieldValue.increment(safeInputTokens),
          total_output_tokens: FieldValue.increment(safeOutputTokens),
          [dailyCostField]: FieldValue.increment(requestCost),
          [dailyInputTokensField]: FieldValue.increment(safeInputTokens),
          [dailyOutputTokensField]: FieldValue.increment(safeOutputTokens),
          last_updated: lastUpdatedTimestamp,
        });
    },
};

export async function POST(req: NextRequest) {
  try {
    const body: ChatRequestBody = await req.json();
    const { messages, modelId, systemPrompt, temperaturePreset, maxTokens, reasoningPreset, webSearchEnabled, imageUri } = body;

    // --- DEBUG START ---
    console.log('[DEBUG] Received request body:', JSON.stringify(body, null, 2));
    // --- DEBUG END ---

    if (!messages || !modelId) {
      return NextResponse.json({ error: 'messages and modelId are required' }, { status: 400 });
    }

    const processedMessages: AppMessage[] = messages.map(msg => ({ ...msg })); // Deep copy to avoid mutation issues

    // If an image URI is provided, download the image and construct a multi-modal message
    if (imageUri) {
        console.log(`[DEBUG] Image URI found: ${imageUri}`);
        try {
            const storage = new Storage();
            console.log('[DEBUG] GCS Storage client initialized.');

            const [bucket, ...fileParts] = imageUri.replace('gs://', '').split('/');
            const fileName = fileParts.join('/');
            
            console.log(`[DEBUG] Attempting to download from bucket: "${bucket}" and file: "${fileName}"`);

            const [fileBuffer] = await storage.bucket(bucket).file(fileName).download();
            console.log(`[DEBUG] Image downloaded from GCS. Buffer size: ${fileBuffer.length}`);

            const lastUserMessage = processedMessages.findLast(m => m.role === 'user');

            if (lastUserMessage) {
                const textContent = typeof lastUserMessage.content === 'string' ? lastUserMessage.content : '';
                
                const [metadata] = await storage.bucket(bucket).file(fileName).getMetadata();
                const mime = metadata?.contentType || "image/png";
                const imageBase64 = fileBuffer.toString("base64");
                const dataUrl = `data:${mime};base64,${imageBase64}`;

                // 修正: imageUrl を使う（AI SDKの期待形式）
                lastUserMessage.content = [
                    { type: 'image', image: dataUrl },
                    { type: 'text', text: textContent }
                ];

                const newContent: Array<{ type: "image"; image: string } | { type: "text"; text: string }> = [
                    { type: "image", image: dataUrl },
                    { type: "text", text: textContent },
                ];

                (lastUserMessage as { content: unknown }).content = newContent;

                if ("parts" in (lastUserMessage as Record<string, unknown>)) {
                    // parts は自前の拡張なので削除
                    delete (lastUserMessage as Record<string, unknown>).parts;
                }

                // ログはbase64を出さない
                console.log("[DEBUG] Constructed multi-modal message:", JSON.stringify({
                    ...lastUserMessage,
                    content: [
                        { type: "image", imageUrl: `data:${mime};base64,[OMITTED length=${imageBase64.length}]` },
                        { type: "text", text: textContent }
                    ]
                }, null, 2));
            }
        } catch (e) {
            console.error('[ERROR] Failed during GCS image processing:', e);
            // Optionally, return a specific error response
            // return NextResponse.json({ error: 'Failed to process image from storage.' }, { status: 500 });
        }
    }

                                    const { monthlyLimitsUSD, pricingPerMillionTokensUSD } = await getModelsConfig();

    const limit = monthlyLimitsUSD[modelId];
    if (limit) {
      const usage = await usageTracker.getUsage(modelId);
      const usagePercentage = (usage.total_cost / limit) * 100;

      if (usagePercentage >= 100) {
        return NextResponse.json({ error: `【利用上限超過】\n\nモデル「${modelId}」は、月間の利用上限額（${limit}）に達したため、現在ご利用いただけません。\n\n管理者にご確認ください。` }, { status: 429 });
      }
      
      if (usagePercentage >= 80) {
        console.log(`[USAGE WARNING] Model ${modelId} has reached ${usagePercentage.toFixed(0)}% of its monthly usage limit (${limit}).`);
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

    let finalTemperature: number | undefined;
    if (reasoningPreset) {
      finalTemperature = REASONING_PRESET_TO_TEMP[reasoningPreset];
    } else if (temperaturePreset) {
      finalTemperature = TEMP_PRESET_MAP[temperaturePreset];
    }

    if ((modelId === 'o3' || modelId === 'o4-mini') && webSearchEnabled) {
      // Step 1: Generate a search query based on the text content of the conversation.
      const conversationHistoryForSearch = messages.map(m => `${m.role}: ${Array.isArray(m.content) ? m.content.map(c => c.type === 'text' ? c.text : '').join('') : m.content}`).join('\n');
      const { object: { query } } = await generateObject({
        model: getOpenAIProvider()('gpt-5-mini'), // Use a fast model for query generation
        temperature: 1, // Force temperature to 1 for query generation
        schema: z.object({
          query: z.string().describe('A concise and effective search query based on the conversation history to answer the latest user prompt.'),
        }),
        prompt: `Based on the following conversation history, generate the most relevant and effective search query to find up-to-date information for the LATEST user prompt. Focus only on what's needed for the last user message.\n\n--- CONVERSATION HISTORY ---\n${conversationHistoryForSearch}\n--- END HISTORY ---`,
      });

      // Step 2: Perform the web search, if a query was generated.
      let searchResults: SearchResult[] = [];
      if (query && query.trim() !== '') {
        searchResults = await searchOnGoogle(query);
      }
      
      // Step 3: Generate the final answer based on the conversation history (with images) and search results.
      const persona = systemPrompt ? `${systemPrompt}\n\n---\n\n` : '';
      const researchInstructions = `You are an expert research assistant. Your goal is to provide a comprehensive, well-structured answer to the user's latest question, seamlessly integrating information from the conversation history and the provided real-time search results.\n\nINSTRUCTIONS:\n1.  Carefully review the entire CONVERSATION HISTORY to understand the full context of the user's request.\n2.  Use the provided SEARCH RESULTS to find the most current and relevant information to answer the user's LATEST prompt.\n3.  Synthesize information from both the conversation and the search results into a single, coherent, and natural-sounding answer.\n4.  Do not explicitly mention that you are using search results (e.g., "According to the search results..."). Act as if you know the information innately.\n5.  If the search results are relevant, create a new section titled "参考資料" at the very end of your answer.\n6.  In this section, list the titles of the web pages you used, and make each title a hyperlink to its URL using Markdown format.\n    Example:\n    ### 参考資料\n    - [東京の天気 - ウェザーニュース](https://weathernews.jp/onebox/tenki/tokyo/)\n7.  If the search results are empty or do not contain relevant information to the user's latest question, answer based on the conversation history alone and omit the "参考資料" section. If you cannot answer, say so politely.\n\nSEARCH RESULTS (for your reference only):\n---\n${searchResults.map((item: SearchResult, index: number) => `[${index + 1}] Title: ${item.title}\nSnippet: ${item.snippet}\nURL: ${item.link}`).join('\n\n') || 'No relevant results found.'}\n---\n`;

      const finalSystemPrompt = `${persona}${researchInstructions}`;

      const result = await streamText({
        messages: processedMessages, // IMPORTANT: Use the messages with image data for the final response
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
        messages: processedMessages, // Pass the processed messages
        system: systemPrompt,
        temperature: finalTemperature,
        maxTokens: maxTokens,
        onFinish: onFinishCallback,
      };

      // --- Final Debug Log Before Calling AI ---
      console.log(`[DEBUG] Calling streamText for model: ${modelId} with config:`, JSON.stringify({
        ...streamTextConfig,
        messages: processedMessages.map(m => ({
          ...m,
          content: Array.isArray(m.content) 
            ? m.content.map(c => c.type === 'image' ? { ...c, image: '[BASE64_DATA_OMITTED]' } : c)
            : m.content
        }))
      }, null, 2));
      // --- End Debug Log ---

      const { modelConfig } = await getModelsConfig();
      const selectedModelConfig = modelConfig[modelId];

      if (selectedModelConfig && selectedModelConfig.service === 'gpt5') {
        const { gpt5ReasoningEffort, gpt5Verbosity, gpt5GroundingEnabled } = body;
        const lastMessage = processedMessages[processedMessages.length - 1];

        let inputText = "";
        let imageFromMsg: string | undefined;

        if (Array.isArray(lastMessage.content)) {
            const textPart = lastMessage.content.find(isTextPart);
            if (textPart) {
                inputText = textPart.text;
            }
            const imagePart = lastMessage.content.find(isImagePart);
            if (imagePart) {
                imageFromMsg = imagePart.image;
            }
        } else if (typeof lastMessage.content === "string") {
            inputText = lastMessage.content;
        }

        const { pricingPerMillionTokensUSD } = await getModelsConfig();
        const pricing = pricingPerMillionTokensUSD[modelId];

        const stream = await streamGpt5Response({
            model: modelId,
            prompt: inputText,
            imageUrlOrDataUrl: imageFromMsg,
            reasoning: gpt5ReasoningEffort || "low",
            verbosity: gpt5Verbosity || "low",
            groundingEnabled: gpt5GroundingEnabled || false,
            systemPrompt: systemPrompt,
            onUsage: async (usage) => {
                if (!pricing) return;
                const inT = usage.input_tokens ?? usage.input_text_tokens ?? 0;
                const outT = usage.output_tokens ?? usage.output_text_tokens ?? 0;
                await usageTracker.updateUsage(modelId, inT, outT, pricing);
            },
        });

        return new Response(stream, {
            headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      } else if (modelId.startsWith('gpt') || modelId.startsWith('o')) {
          const result = await streamText({ ...streamTextConfig, model: getOpenAIProvider()(modelId) });
          return result.toDataStreamResponse();
      } else if (modelId.startsWith('claude')) {
          // Claude Sonnet 4.5 requires special handling with Anthropic SDK directly
          if (modelId === 'claude-sonnet-4-5') {
            const Anthropic = (await import('@anthropic-ai/sdk')).default;
            
            const anthropic = new Anthropic({
              apiKey: process.env.LLM_GCP_ANTHROPIC_API_KEY,
            });

            const encoder = new TextEncoder();
            const stream = new ReadableStream({
              async start(controller) {
                try {
                  const anthropicStream = await anthropic.messages.stream({
                    model: 'claude-sonnet-4-5-20250929',
                    max_tokens: maxTokens || 64000,
                    temperature: finalTemperature || 0.6,
                    system: systemPrompt || 'You are a helpful assistant.',
                    messages: processedMessages.map(m => {
                      // Handle multimodal content
                      if (Array.isArray(m.content)) {
                        const anthropicContent: Array<{type: 'text'; text: string} | {type: 'image'; source: {type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string}}> = [];
                        
                        for (const part of m.content) {
                          if (part.type === 'text' && 'text' in part) {
                            anthropicContent.push({ type: 'text', text: part.text });
                          } else if (part.type === 'image' && 'image' in part && typeof part.image === 'string') {
                            // Extract base64 data and media type from data URL
                            const dataUrl = part.image;
                            const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                            if (matches) {
                              let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/png';
                              const extractedType = matches[1];
                              if (extractedType === 'image/jpeg' || extractedType === 'image/png' || 
                                  extractedType === 'image/gif' || extractedType === 'image/webp') {
                                mediaType = extractedType;
                              }
                              const base64Data = matches[2];
                              anthropicContent.push({
                                type: 'image',
                                source: {
                                  type: 'base64',
                                  media_type: mediaType,
                                  data: base64Data
                                }
                              });
                            }
                          }
                        }
                        
                        return {
                          role: m.role as 'user' | 'assistant',
                          content: anthropicContent
                        };
                      }
                      
                      // Handle string content
                      return {
                        role: m.role as 'user' | 'assistant',
                        content: typeof m.content === 'string' ? m.content : ''
                      };
                    }) as Parameters<typeof anthropic.messages.stream>[0]['messages'],
                  });

                  let inputTokens = 0;
                  let outputTokens = 0;

                  for await (const event of anthropicStream) {
                    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                      controller.enqueue(encoder.encode(`0:${JSON.stringify(event.delta.text)}\n`));
                    } else if (event.type === 'message_start') {
                      inputTokens = event.message.usage.input_tokens;
                      console.log('[DEBUG] Anthropic API Response - Model:', event.message.model);
                    } else if (event.type === 'message_delta') {
                      outputTokens = event.usage.output_tokens;
                    }
                  }

                  // Update usage tracking
                  const pricing = pricingPerMillionTokensUSD[modelId];
                  if (pricing) {
                    await usageTracker.updateUsage(modelId, inputTokens, outputTokens, pricing);
                  }

                  controller.close();
                } catch (error) {
                  console.error('[ERROR] Claude Sonnet 4.5 error:', error);
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
          }
          
          // Other Claude models use AI SDK v4
          const claudeModelMap: { [key: string]: string } = { 'claude-sonnet4': 'claude-sonnet-4-20250514' };
          const anthropicModelId = claudeModelMap[modelId] || modelId;
          const result = await streamText({ ...streamTextConfig, model: getAnthropicProvider()(anthropicModelId), system: systemPrompt || 'You are a helpful assistant.' });
          return result.toDataStreamResponse();
      } else if (modelId.startsWith('gemini')) {
          console.log(`[DEBUG] Processing Gemini model: ${modelId}`);
          
          // Special handling for Gemini 3 Pro Preview
          if (modelId === 'gemini-3-pro-preview') {
            console.log('[DEBUG] Using dedicated Gemini 3 service with thinkingConfig');
            
            const { gemini3ThinkingLevel } = body;
            
            const stream = await streamGemini3Response({
              model: modelId,
              messages: processedMessages.map(m => {
                let content: string | Array<{type: string; text?: string; image?: string}>;
                
                if (typeof m.content === 'string') {
                  content = m.content;
                } else if (Array.isArray(m.content)) {
                  content = m.content.map(part => {
                    if ('text' in part && typeof part.text === 'string') {
                      return { type: 'text', text: part.text };
                    } else if ('image' in part) {
                      // Handle image content
                      const imageData = typeof part.image === 'string' ? part.image : '';
                      return { type: 'image', image: imageData };
                    }
                    return { type: 'text', text: '' };
                  }).filter(p => p.text || p.image);
                } else {
                  content = '';
                }
                
                return {
                  role: m.role,
                  content,
                };
              }),
              systemPrompt: systemPrompt,
              temperature: finalTemperature,
              maxTokens: maxTokens,
              thinkingLevel: gemini3ThinkingLevel || 'high', // Default to 'high' if not specified
            });

            // Handle usage tracking for Gemini 3
            // Note: We'll need to get usage from the response metadata
            // For now, we'll skip usage tracking until we implement it properly
            
            return new Response(stream, {
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
          }
          
          // --- Gemini Specific Parameter Adjustment (for other Gemini models) ---
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
          const MINIMUM_GEMINI_TOKENS = 2000;
          if (adjustedMaxTokens && adjustedMaxTokens < MINIMUM_GEMINI_TOKENS) {
            adjustedMaxTokens = MINIMUM_GEMINI_TOKENS;
          }

          try {
            console.log(`[DEBUG] Calling Vertex AI with model: ${modelId}`);
            const result = await streamText({ 
                ...streamTextConfig, 
                model: getGoogleProvider()(modelId),
                maxTokens: adjustedMaxTokens,
                system: adjustedSystemPrompt,
            });
            return result.toDataStreamResponse();
          } catch (geminiError) {
            console.error(`[ERROR] Vertex AI error for model ${modelId}:`, geminiError);
            console.error('[ERROR] Error details:', JSON.stringify(geminiError, null, 2));
            throw geminiError;
          }
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
