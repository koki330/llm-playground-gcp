import { DocumentProcessorServiceClient } from '@google-cloud/documentai';

// The client will automatically determine the endpoint from the processor name passed in the request.
// We only need to provide the credentials for local development.
const serviceAccountJson = process.env.LLM_GCP_VERTEX_AI_SERVICE_ACCOUNT_JSON;
const credentials = serviceAccountJson ? JSON.parse(serviceAccountJson) : undefined;

const clientOptions = {
    credentials,
};

const documentAiClient = new DocumentProcessorServiceClient(clientOptions);

/**
 * Processes a file buffer from a PNG or PDF using Google Cloud Document AI.
 * @param fileBuffer The file content as a Buffer.
 * @param mimeType The MIME type of the file (e.g., 'image/png', 'application/pdf').
 * @returns A promise that resolves to the extracted text.
 */
export async function processDocument(fileBuffer: Buffer, mimeType: string): Promise<string> {
    // The full processor name, including project and location, is expected from the environment variable.
    const processorName = process.env.LLM_GCP_DOCAI_PROCESSOR_NAME;

    if (!processorName) {
        throw new Error('Missing required environment variable: LLM_GCP_DOCAI_PROCESSOR_NAME.');
    }

    const request = {
        name: processorName,
        rawDocument: {
            content: fileBuffer.toString('base64'),
            mimeType,
        },
    };

    // Retry logic for handling transient errors
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[DEBUG] Sending request to Document AI processor (attempt ${attempt}/${maxRetries}): ${processorName}`);
            const [result] = await documentAiClient.processDocument(request);
            
            if (result.document?.text) {
                console.log('[DEBUG] Successfully extracted text from Document AI.');
                return result.document.text;
            } else {
                console.warn('[WARN] Document AI processed the file, but no text was found.');
                return ''; // Return an empty string instead of an error message
            }
        } catch (error) {
            console.error(`[ERROR] Document AI API call failed (attempt ${attempt}/${maxRetries}):`, error);
            
            // Check if it's a retryable error (503, 429, network errors)
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isRetryable = errorMessage.includes('503') || 
                               errorMessage.includes('Service Unavailable') ||
                               errorMessage.includes('429') ||
                               errorMessage.includes('UNAVAILABLE') ||
                               errorMessage.includes('DEADLINE_EXCEEDED');
            
            if (attempt < maxRetries && isRetryable) {
                console.log(`[INFO] Retrying in ${retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
                continue;
            }
            
            // If not retryable or max retries reached, throw error
            throw new Error(`Document AI processing failed after ${attempt} attempt(s): ${errorMessage}`);
        }
    }
    
    throw new Error('Document AI processing failed: Maximum retries exceeded');
}
