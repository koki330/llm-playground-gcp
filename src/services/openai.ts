import OpenAI from 'openai';
import { Storage } from '@google-cloud/storage';
import { Message } from '@/types';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const storage = new Storage();

// Helper function to generate a signed URL for a GCS file
async function getSignedUrl(gcsUri: string): Promise<string> {
  const match = gcsUri.match(/^gs:\/\/([^\/]+)\/([^\/]+)$/);
  if (!match) {
    throw new Error('Invalid GCS URI');
  }
  const bucketName = match[1];
  const fileName = match[2];

  const options = {
    version: 'v4' as const,
    action: 'read' as const,
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
  };

  const [url] = await storage.bucket(bucketName).file(fileName).getSignedUrl(options);
  return url;
}

class OpenAIService {
  async getStreamingResponse(messages: Message[], modelId: string, systemPrompt: string) {
    const formattedMessages: ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }

    for (const message of messages) {
      const contentParts = await Promise.all(
        message.content.map(async (part) => {
          if (part.type === 'image' && part.image?.gcsUri) {
            const signedUrl = await getSignedUrl(part.image.gcsUri);
            return {
              type: 'image_url' as const,
              image_url: { url: signedUrl },
            };
          }
          return { type: 'text' as const, text: part.text || '' };
        })
      );

      if (message.role === 'user') {
        formattedMessages.push({
          role: 'user',
          content: contentParts,
        });
      } else if (message.role === 'model') {
        // OpenAIでは、画像を含むアシスタントメッセージは現在サポートされていないため、テキストのみを連結
        const textContent = contentParts
          .filter(part => part.type === 'text')
          .map(part => part.text)
          .join('\n');
        
        formattedMessages.push({
          role: 'assistant',
          content: textContent,
        });
      }
    }

    const stream = await openai.chat.completions.create({
      model: modelId,
      messages: formattedMessages,
      stream: true,
    });

    return stream;
  }
}

export const openAIService = new OpenAIService();