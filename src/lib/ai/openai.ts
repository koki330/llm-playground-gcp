import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function streamOpenAI(modelId: string, prompt: string) {
  const stream = await openai.chat.completions.create({
    model: modelId,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
  });
  return stream;
}