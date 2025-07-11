import { VertexAI, Content, Part } from '@google-cloud/vertexai';
import { Message } from '@/types';

// Updated helper to handle multimodal content
const mapVercelMessagesToGemini = (messages: Message[]): Content[] => {
  return messages.map(message => {
    const role = message.role === 'user' ? 'user' : 'model';
    const parts: Part[] = message.content.map((part) => {
      if (part.type === 'image' && part.image?.gcsUri) {
        return {
          fileData: {
            fileUri: part.image.gcsUri,
            mimeType: part.image.mediaType,
          },
        };
      } else {
        return { text: part.text || '' };
      }
    });

    return {
      role: role,
      parts: parts,
    };
  });
};

class VertexAIService {
  private vertexAI: VertexAI;

  constructor() {
    this.vertexAI = new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT_ID || '',
      location: process.env.GOOGLE_CLOUD_LOCATION || '',
      googleAuthOptions: {
        credentials: process.env.VERTEX_AI_SERVICE_ACCOUNT_JSON
          ? JSON.parse(process.env.VERTEX_AI_SERVICE_ACCOUNT_JSON)
          : undefined,
        scopes: 'https://www.googleapis.com/auth/cloud-platform',
      }
    });
  }

  async getStreamingResponse(messages: Message[], modelId: string, systemPrompt: string) {
    const generativeModel = this.vertexAI.getGenerativeModel({ 
      model: modelId,
      systemInstruction: systemPrompt ? { role: 'system', parts: [{ text: systemPrompt }] } : undefined,
    });

    const historyMessages = messages.slice(0, -1);
    const lastMessage = messages[messages.length - 1];

    const geminiHistory = mapVercelMessagesToGemini(historyMessages);
    const lastMessageParts = mapVercelMessagesToGemini([lastMessage])[0].parts;

    const chat = generativeModel.startChat({
      history: geminiHistory,
    });
    
    const streamResult = await chat.sendMessageStream(lastMessageParts);
    
    return streamResult;
  }
}

export const vertexAIService = new VertexAIService();
