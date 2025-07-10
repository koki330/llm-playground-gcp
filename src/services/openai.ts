import OpenAI from 'openai';
import { Storage } from '@google-cloud/storage';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const storage = new Storage();

// Helper function to generate a signed URL for a GCS file
async function getSignedUrl(gcsUri: string): Promise<string> {
  const match = gcsUri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
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
  async getStreamingResponse(messages: any[], modelId: string, systemPrompt: string) {
    const processContent = async (content: any) => {
      if (Array.isArray(content)) {
        return Promise.all(
          content.map(async (part: any) => {
            if (part.type === 'image' && part.image?.gcsUri) {
              const signedUrl = await getSignedUrl(part.image.gcsUri);
              return {
                type: 'image_url' as const,
                image_url: { url: signedUrl },
              };
            } else {
              return { type: 'text' as const, text: part.text };
            }
          })
        );
      } else {
        return content;
      }
    };

    let formattedMessages = await Promise.all(
      messages.map(async ({ role, content }) => ({
        role: role === 'model' ? 'assistant' : role,
        content: await processContent(content),
      }))
    );

    if (systemPrompt) {
      formattedMessages.unshift({ role: 'system', content: systemPrompt });
    }

    const stream = await openai.chat.completions.create({
      model: modelId,
      messages: formattedMessages as any,
      stream: true,
    });

    return stream;
  }
}

export const openAIService = new OpenAIService();