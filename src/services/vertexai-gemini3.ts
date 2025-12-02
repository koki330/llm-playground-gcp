import { GoogleAuth } from 'google-auth-library';

interface Gemini3StreamParams {
  model: string;
  messages: Array<{
    role: string;
    content: string | Array<{type: string; text?: string; image?: string}>;
  }>;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  thinkingLevel?: 'low' | 'high';
  groundingEnabled?: boolean;
  projectId?: string;
  location?: string;
}

export async function streamGemini3Response(params: Gemini3StreamParams): Promise<ReadableStream<Uint8Array>> {
  const {
    model,
    messages,
    systemPrompt,
    temperature = 1.0, // Gemini 3 recommends keeping temperature at 1.0
    maxTokens = 65536,
    thinkingLevel = 'high', // Default to 'high' if not specified
    groundingEnabled = false,
    projectId = process.env.LLM_GCP_GOOGLE_CLOUD_PROJECT_ID,
    location = 'global', // Gemini 3 Pro Preview only supports 'global' region
  } = params;

  if (!projectId) {
    throw new Error('Project ID is required for Vertex AI');
  }

  // Get access token
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  if (!accessToken.token) {
    throw new Error('Failed to get access token');
  }

  // Convert messages to Vertex AI format
  const contents = messages.map(msg => {
    if (typeof msg.content === 'string') {
      return {
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      };
    } else {
      // Handle multimodal content
      const parts = msg.content.map(part => {
        if (part.type === 'text' && part.text) {
          return { text: part.text };
        } else if (part.type === 'image' && part.image) {
          // Extract base64 data from data URL
          const matches = part.image.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            return {
              inlineData: {
                mimeType: matches[1],
                data: matches[2],
              },
            };
          }
        }
        return { text: '' };
      }).filter(part => part.text !== '' || part.inlineData);

      return {
        role: msg.role === 'user' ? 'user' : 'model',
        parts,
      };
    }
  });

  // Build request body with thinkingConfig for Gemini 3
  const requestBody: {
    contents: typeof contents;
    generationConfig: {
      temperature: number;
      maxOutputTokens: number;
      thinkingConfig: {
        thinkingLevel: 'low' | 'high';
      };
    };
    systemInstruction?: {
      parts: Array<{ text: string }>;
    };
    tools?: Array<{ google_search: Record<string, never> }>;
  } = {
    contents,
    generationConfig: {
      temperature, // Should be 1.0 for Gemini 3 (recommended)
      maxOutputTokens: maxTokens,
      thinkingConfig: {
        thinkingLevel, // HIGH: max reasoning (default), LOW: faster response
      },
    },
  };

  if (systemPrompt) {
    requestBody.systemInstruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  // Add Google Search grounding if enabled
  if (groundingEnabled) {
    // Gemini 3 uses 'google_search' field instead of 'googleSearchRetrieval'
    requestBody.tools = [
      {
        google_search: {},
      } as { google_search: Record<string, never> },
    ];
  }

  // Gemini 3 uses global endpoint (no region prefix in hostname)
  const endpoint = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:streamGenerateContent`;

  console.log('[DEBUG] Calling Vertex AI Gemini 3 with endpoint:', endpoint);
  console.log('[DEBUG] Gemini 3 Request Body:', JSON.stringify(requestBody, null, 2));
  if (groundingEnabled) {
    console.log('[DEBUG] Gemini 3 Grounding ENABLED - tools:', JSON.stringify(requestBody.tools, null, 2));
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ERROR] Vertex AI Gemini 3 API error:', errorText);
    throw new Error(`Vertex AI API error: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('Response body is null');
  }

  // Transform the Vertex AI stream to AI SDK format
  const encoder = new TextEncoder();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      try {
        let buffer = '';
        let jsonBuffer = '';
        let bracketCount = 0;
        let inJson = false;

        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          
          // Process character by character to find complete JSON objects
          for (let i = 0; i < buffer.length; i++) {
            const char = buffer[i];
            
            if (char === '[' || char === '{') {
              if (!inJson) {
                inJson = true;
                jsonBuffer = '';
              }
              bracketCount++;
              jsonBuffer += char;
            } else if (char === ']' || char === '}') {
              jsonBuffer += char;
              bracketCount--;
              
              // Complete JSON object found
              if (bracketCount === 0 && inJson) {
                try {
                  const data = JSON.parse(jsonBuffer);
                  
                  // Handle array response
                  const dataArray = Array.isArray(data) ? data : [data];
                  
                  // Process each item
                  for (const item of dataArray) {
                    if (item.candidates && item.candidates[0]?.content?.parts) {
                      for (const part of item.candidates[0].content.parts) {
                        // Skip thought parts, only send regular text
                        if (part.text && !part.thought) {
                          controller.enqueue(encoder.encode(`0:${JSON.stringify(part.text)}\n`));
                        }
                      }
                    }
                  }
                } catch (e) {
                  console.error('[ERROR] Failed to parse JSON:', e);
                }
                
                inJson = false;
                jsonBuffer = '';
              }
            } else if (inJson) {
              jsonBuffer += char;
            }
          }
          
          // Clear processed buffer
          buffer = '';
        }

        controller.close();
      } catch (error) {
        console.error('[ERROR] Gemini 3 stream error:', error);
        controller.error(error);
      }
    },
  });
}
