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

    try {
        console.log(`[DEBUG] Sending request to Document AI processor: ${processorName}`);
        const [result] = await documentAiClient.processDocument(request);
        
        // --- Start of Debugging Block ---
        console.log('[DEBUG] Full response from Document AI:', JSON.stringify(result, null, 2));
        // --- End of Debugging Block ---
        
        if (result.document?.text) {
            console.log('[DEBUG] Successfully extracted text from Document AI.');
            return result.document.text;
        } else {
            console.warn('[WARN] Document AI processed the file, but no text was found.');
            return ''; // Return an empty string instead of an error message
        }
    } catch (error) {
        // --- Start of Debugging Block ---
        console.error('[FATAL ERROR] Document AI API call failed. Full error object:', JSON.stringify(error, null, 2));
        // --- End of Debugging Block ---
        throw new Error(`Document AI processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}