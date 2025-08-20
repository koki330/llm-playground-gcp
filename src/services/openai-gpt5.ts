import { OpenAI } from 'openai';

export async function getGpt5Response(model: string, input: string, options: { reasoning: 'minimal' | 'low' | 'medium' | 'high', verbosity: 'low' | 'medium' | 'high' }) {
  const openai = new OpenAI({
    apiKey: process.env.LLM_GCP_OPENAI_API_KEY,
  });
  try {
    const result = await openai.responses.create({
      model: model,
      input: input,
      reasoning: { effort: options.reasoning },
      text: { verbosity: options.verbosity },
    });
    if (!result.output_text) {
        throw new Error('No output text in response');
    }
    return result.output_text;
  } catch (error) {
    console.error('Error getting GPT-5 response:', error);
    throw error;
  }
}
