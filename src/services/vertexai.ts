import { createVertex, GoogleVertexProvider } from '@ai-sdk/google-vertex';

/**
 * Lazily creates and returns the Google Vertex AI provider.
 * This provider correctly uses service account credentials (ADC) instead of an API key.
 */
export function getGoogleProvider(): GoogleVertexProvider {
    // This function will automatically use the service account specified
    // by the LLM_GCP_VERTEX_AI_SERVICE_ACCOUNT_JSON env var in local development,
    // and the attached service account in Cloud Run.
    // It requires the project and location to be explicitly set.
    return createVertex({
        project: process.env.LLM_GCP_GOOGLE_CLOUD_PROJECT_ID,
        location: process.env.LLM_GCP_GOOGLE_CLOUD_LOCATION,
    });
}