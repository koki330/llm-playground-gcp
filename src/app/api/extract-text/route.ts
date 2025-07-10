import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';

export const runtime = 'nodejs';

const storage = new Storage();

async function downloadFileAsText(gcsUri: string): Promise<string> {
  const match = gcsUri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid GCS URI format: ${gcsUri}`);
  }
  const bucketName = match[1];
  const fileName = match[2];

  const file = storage.bucket(bucketName).file(fileName);
  const [buffer] = await file.download();
  
  // Assuming UTF-8 encoding for text files. 
  // More advanced logic could be added here to detect other encodings.
  return buffer.toString('utf-8');
}

export async function POST(req: NextRequest) {
  try {
    const { gcsUri } = await req.json();

    if (!gcsUri) {
      return NextResponse.json({ error: 'gcsUri is required.' }, { status: 400 });
    }

    const textContent = await downloadFileAsText(gcsUri);

    return NextResponse.json({ text: textContent });

  } catch (error) {
    console.error('Error extracting text from file:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ error: `Failed to extract text: ${errorMessage}` }, { status: 500 });
  }
}