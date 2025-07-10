import Anthropic from '@anthropic-ai/sdk';
import { Storage } from '@google-cloud/storage';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const storage = new Storage();

// Helper function to download from GCS and encode to base64
async function gcsFileToBase64(gcsUri: string): Promise<string> {
  const match = gcsUri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
  if (!match) {
    throw new Error('Invalid GCS URI');
  }
  const bucketName = match[1];
  const fileName = match[2];

  const file = storage.bucket(bucketName).file(fileName);
  const [buffer] = await file.download();
  return buffer.toString('base64');
}

class AnthropicService {
  async getStreamingResponse(messages: any[], modelId: string, systemPrompt: string) {
    const formattedMessages = await Promise.all(
      messages.map(async ({ role, content }) => {
        const newContent = await Promise.all(
          content.map(async (part: any) => {
            if (part.type === 'image' && part.image?.gcsUri) {
              const base64Data = await gcsFileToBase64(part.image.gcsUri);
              return {
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: part.image.mediaType,
                  data: base64Data,
                },
              };
            } else {
              return { type: 'text' as const, text: part.text };
            }
          })
        );

        return {
          role: role === 'model' ? 'assistant' : role,
          content: newContent,
        };
      })
    );

    const stream = await anthropic.messages.create({
      model: modelId,
      system: systemPrompt,
      messages: formattedMessages as any,
      max_tokens: 4096,
      stream: true,
    });

    return stream;
  }
}

export const anthropicService = new AnthropicService();
