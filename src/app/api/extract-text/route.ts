import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';

export const runtime = 'nodejs';

const storage = new Storage();

async function downloadFile(gcsUri: string): Promise<Buffer> {
  const match = gcsUri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid GCS URI format: ${gcsUri}`);
  }
  const bucketName = match[1];
  const fileName = match[2];

  const file = storage.bucket(bucketName).file(fileName);
  const [buffer] = await file.download();
  return buffer;
}

export async function POST(req: NextRequest) {
  try {
    const { gcsUri, contentType } = await req.json();

    if (!gcsUri || !contentType) {
      return NextResponse.json({ error: 'gcsUri and contentType are required.' }, { status: 400 });
    }

    const buffer = await downloadFile(gcsUri);
    let textContent = '';

    if (contentType === 'application/json') {
      const rawText = buffer.toString('utf-8');
      const parsedJson = JSON.parse(rawText);
      textContent = JSON.stringify(parsedJson, null, 2); // Pretty-print the JSON
    } else {
      // Default to plain text
      textContent = buffer.toString('utf-8');
    }

    return NextResponse.json({ text: textContent });

  } catch (error) {
    console.error('Error extracting text from file:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ error: `Failed to extract text: ${errorMessage}` }, { status: 500 });
  }
}