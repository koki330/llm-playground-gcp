import Anthropic from '@anthropic-ai/sdk';
import { Storage } from '@google-cloud/storage';
import { Message } from '@/types';
import { MessageParam, ContentBlockParam } from '@anthropic-ai/sdk/resources/messages';

// Anthropicが受け入れるMIMEタイプのリスト
const ALLOWED_ANTHROPIC_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

// 上記リストの型を定義
type AnthropicMediaType = typeof ALLOWED_ANTHROPIC_MEDIA_TYPES[number];

// 型ガード関数：stringがAnthropicのMIMEタイプかチェック
function isAnthropicMediaType(mediaType: string): mediaType is AnthropicMediaType {
  return (ALLOWED_ANTHROPIC_MEDIA_TYPES as readonly string[]).includes(mediaType);
}

async function gcsFileToBase64(storage: Storage, gcsUri: string): Promise<string> {
  const match = gcsUri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
  if (!match) throw new Error('Invalid GCS URI');
  const bucketName = match[1];
  const fileName = match[2];
  const file = storage.bucket(bucketName).file(fileName);
  const [buffer] = await file.download();
  return buffer.toString('base64');
}

class AnthropicService {
  private anthropic: Anthropic;
  private storage: Storage;

  constructor() {
    // ★★★ constructorの中でクライアントを初期化する ★★★
    this.anthropic = new Anthropic({
      apiKey: process.env.LLM_GCP_ANTHROPIC_API_KEY,
    });
    this.storage = new Storage();
  }
  async getStreamingResponse(messages: Message[], modelId: string, systemPrompt: string) {
    const formattedMessages: MessageParam[] = await Promise.all(
      messages.map(async ({ role, content }) => {
        const newContent: ContentBlockParam[] = [];
        for (const part of content) {
          if (part.type === 'image' && part.image?.gcsUri && isAnthropicMediaType(part.image.mediaType)) {
            const base64Data = await gcsFileToBase64(this.storage, part.image.gcsUri);
            newContent.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: part.image.mediaType, // 型ガードにより安全
                data: base64Data,
              },
            });
          } else if (part.type === 'text') {
            newContent.push({ type: 'text', text: part.text || '' });
          }
        }

        return {
          role: role === 'model' ? 'assistant' : 'user',
          content: newContent,
        };
      })
    );

    const stream = await this.anthropic.messages.create({
      model: modelId,
      system: systemPrompt,
      messages: formattedMessages,
      max_tokens: 4096,
      stream: true,
    });

    return stream;
  }
}

let anthropicServiceInstance: AnthropicService | null = null;

export const getAnthropicService = (): AnthropicService => {
  if (!anthropicServiceInstance) {
    anthropicServiceInstance = new AnthropicService();
  }
  return anthropicServiceInstance;
};