import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import { processDocument } from '@/services/documentAiService';
import mammoth from 'mammoth';
import * as xlsx from 'xlsx';

const serviceAccountJson = process.env.LLM_GCP_VERTEX_AI_SERVICE_ACCOUNT_JSON;
const credentials = serviceAccountJson ? JSON.parse(serviceAccountJson) : undefined;

const storage = new Storage({
  credentials,
});

// This function now correctly handles different MIME types.
async function extractTextFromFile(fileBuffer: Buffer, mimeType: string): Promise<string> {
    console.log(`[DEBUG] extractTextFromFile received MIME type: ${mimeType}`);
    if (mimeType === 'image/png' || mimeType === 'application/pdf') {
        return processDocument(fileBuffer, mimeType);
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const { value } = await mammoth.extractRawText({ buffer: fileBuffer });
        return value;
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        return xlsx.utils.sheet_to_txt(worksheet);
    } else if (mimeType === 'text/plain' || mimeType === 'application/json') {
        return fileBuffer.toString('utf-8');
    } else {
        return `File type (${mimeType}) is not supported for text extraction.`;
    }
}

export async function POST(req: NextRequest) {
  try {
    const { gcsUri, contentType } = await req.json();

    if (!gcsUri || !contentType) {
      return NextResponse.json({ error: 'gcsUri and contentType are required' }, { status: 400 });
    }

    const [bucket, ...fileParts] = gcsUri.replace('gs://', '').split('/');
    const fileName = fileParts.join('/');

    console.log(`[DEBUG] Downloading from GCS: gs://${bucket}/${fileName}`);
    const [fileBuffer] = await storage.bucket(bucket).file(fileName).download();
    
    // --- Start of Debugging Block ---
    let extractedText;
    try {
        console.log(`[DEBUG] Calling extractTextFromFile for ${contentType}...`);
        extractedText = await extractTextFromFile(fileBuffer, contentType);
        console.log(`[DEBUG] extractTextFromFile returned. Text length: ${extractedText.length}`);
    } catch (e) {
        console.error('[FATAL ERROR] Error occurred *within* extractTextFromFile call:', e);
        const err = e instanceof Error ? e : new Error(String(e));
        return NextResponse.json({ error: `Failed during text extraction process: ${err.message}` }, { status: 500 });
    }
    // --- End of Debugging Block ---

    console.log(`[DEBUG] Final extracted text length: ${extractedText.length}`);
    return NextResponse.json({ text: extractedText });

  } catch (error) {
    console.error('[ERROR] in /api/extract-text:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ error: `Failed to extract text: ${errorMessage}` }, { status: 500 });
  }
}