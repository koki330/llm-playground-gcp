import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import mammoth from 'mammoth';
import * as xlsx from 'xlsx';

export const runtime = 'nodejs';

const storage = new Storage();
const docAIClient = new DocumentProcessorServiceClient();

// Helper function to download a file from GCS into a buffer
async function downloadFile(gcsUri: string): Promise<Buffer> {
  console.log(`--- downloadFile START for ${gcsUri} ---`);
  const match = gcsUri.match(/^gs:\/\/([^\/]+)\/([^\/]+)$/);
  if (!match) {
    throw new Error(`Invalid GCS URI format: ${gcsUri}`);
  }
  const bucketName = match[1];
  const fileName = match[2];

  const file = storage.bucket(bucketName).file(fileName);
  const [buffer] = await file.download();
  console.log(`--- downloadFile END for ${gcsUri} ---`);
  return buffer;
}

// This helper function is now ONLY for PDF processing
async function processPdfWithDocumentAI(gcsUri: string, mimeType: string): Promise<string> {
  console.log('--- processWithDocumentAI START for PDF---');
  const processorName = process.env.DOCAI_PROCESSOR_NAME;
  if (!processorName) {
    console.error('DOCAI_PROCESSOR_NAME environment variable not set.');
    throw new Error('DOCAI_PROCESSOR_NAME environment variable not set.');
  }
  console.log(`Using Document AI Processor: ${processorName}`);

  const request = {
    name: processorName,
    gcsDocument: {
        gcsUri: gcsUri,
        mimeType: mimeType,
    },
  };
  console.log('Sending request to Document AI:', JSON.stringify(request, null, 2));

  const [result] = await docAIClient.processDocument(request);
  console.log('Received response from Document AI.');
  const { document } = result;

  if (!document || !document.text) {
    console.warn('Document AI did not return any text for the PDF.');
    throw new Error('Document AI did not return any text for the PDF.');
  }

  console.log(`Extracted text length: ${document.text.length}`);
  console.log('--- processWithDocumentAI END ---');
  return document.text;
}

export async function POST(req: NextRequest) {
  console.log('--- /api/extract-text START ---');
  try {
    const { gcsUri, contentType } = await req.json();
    console.log(`Received request for gcsUri: ${gcsUri}, contentType: ${contentType}`);

    if (!gcsUri || !contentType) {
      console.error('gcsUri and/or contentType are missing');
      return NextResponse.json({ error: 'gcsUri and contentType are required.' }, { status: 400 });
    }

    let textContent = '';

    // PDF is handled by Document AI and doesn't need pre-downloading
    if (contentType === 'application/pdf') {
      console.log('Routing to Document AI for PDF processing.');
      textContent = await processPdfWithDocumentAI(gcsUri, contentType);
    } else {
      // For all other types, we download the file first and process locally
      const buffer = await downloadFile(gcsUri);

      switch (contentType) {
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          console.log('Processing DOCX file with mammoth...');
          const docxResult = await mammoth.extractRawText({ buffer });
          textContent = docxResult.value;
          break;

        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
          console.log('Processing XLSX file with xlsx...');
          const workbook = xlsx.read(buffer, { type: 'buffer' });
          let fullText = '';
          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const sheetText = xlsx.utils.sheet_to_txt(worksheet);
            fullText += `--- Sheet: ${sheetName} ---\n${sheetText}\n\n`;
          });
          textContent = fullText;
          break;

        case 'application/json':
          console.log('Processing JSON file...');
          const rawText = buffer.toString('utf-8');
          const parsedJson = JSON.parse(rawText);
          textContent = JSON.stringify(parsedJson, null, 2);
          break;

        case 'text/plain':
          console.log('Processing plain text file...');
          textContent = buffer.toString('utf-8');
          break;

        default:
          console.log(`Unsupported content type for extraction: ${contentType}`);
          break;
      }
    }

    console.log('--- /api/extract-text END ---');
    return NextResponse.json({ text: textContent });

  } catch (error) {
    console.error('--- ERROR in /api/extract-text ---');
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ error: `Failed to extract text: ${errorMessage}` }, { status: 500 });
  }
}