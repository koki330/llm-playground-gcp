import { VertexAI, Content } from '@google-cloud/vertexai';
import { GoogleAuth } from 'google-auth-library';

// Helper to map Vercel AI SDK message format to Gemini format
const mapVercelMessagesToGemini = (messages: any[]): Content[] => {
  return messages.map(message => {
    // The custom context uses 'model' for model responses, which matches Gemini's expectation.
    const role = message.role === 'user' ? 'user' : 'model';
    return {
      role: role,
      parts: [{ text: message.content }],
    };
  });
};

class VertexAIService {
  private vertexAI: VertexAI;

  constructor() {
    // Adaptable authentication
    // For production (e.g., Cloud Run), use the JSON content from the environment variable.
    // For local development, the library will automatically use the file path from GOOGLE_APPLICATION_CREDENTIALS.
    const authOptions = {
      credentials: process.env.VERTEX_AI_SERVICE_ACCOUNT_JSON
        ? JSON.parse(process.env.VERTEX_AI_SERVICE_ACCOUNT_JSON)
        : undefined,
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    };

    const auth = new GoogleAuth(authOptions);

    this.vertexAI = new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT_ID || '',
      location: process.env.GOOGLE_CLOUD_LOCATION || '',
      auth: auth,
    });
  }

  // This method will handle streaming responses from the model
  async getStreamingResponse(messages: any[], modelId: string, systemPrompt: string) {
    const generativeModel = this.vertexAI.getGenerativeModel({ 
      model: modelId,
      // Add system instruction if provided
      systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    });

    const historyMessages = messages.slice(0, -1);
    const lastMessage = messages[messages.length - 1];

    const geminiHistory = mapVercelMessagesToGemini(historyMessages);

    const chat = generativeModel.startChat({
      history: geminiHistory,
    });
    
    const streamResult = await chat.sendMessageStream(lastMessage.content);
    
    // Return the entire result which includes the stream and the final response promise
    return streamResult;
  }
}

export const vertexAIService = new VertexAIService();
