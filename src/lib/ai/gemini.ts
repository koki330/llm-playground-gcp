import { VertexAI } from '@google-cloud/vertexai';

let vertex_ai: VertexAI;

function getClient() {
  if (vertex_ai) return vertex_ai;

  const saKeyBase64 = process.env.GEMINI_SA_KEY_BASE64;
  if (!saKeyBase64) {
    throw new Error('GEMINI_SA_KEY_BASE64 environment variable is not set for local development.');
  }

  try {
    const saKeyJson = Buffer.from(saKeyBase64, 'base64').toString('utf-8');
    const credentials = JSON.parse(saKeyJson);

    vertex_ai = new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT || credentials.project_id,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
      credentials,
    });

    return vertex_ai;
  } catch (error) {
    console.error("Failed to parse Gemini Service Account Key:", error);
    throw new Error("Invalid Gemini Service Account Key.");
  }
}

export async function streamGemini(modelId: string, prompt: string) {
  const client = getClient();
  const generativeModel = client.getGenerativeModel({ model: modelId });
  const result = await generativeModel.generateContentStream(prompt);
  return result.stream;
}