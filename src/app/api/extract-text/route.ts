'''
import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import { PDFNet } from '@pdftron/pdfnet-node';

export const runtime = 'nodejs';

const storage = new Storage();

async function downloadPdfFromGcs(gcsUri: string): Promise<Buffer> {
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
    const { gcsUri } = await req.json();

    if (!gcsUri) {
      return NextResponse.json({ error: 'gcsUri is required.' }, { status: 400 });
    }

    const pdfBuffer = await downloadPdfFromGcs(gcsUri);

    // Use PDFTron PDFNet with the correct API usage based on the provided documentation
    const textContent = await PDFNet.runWithCleanup(async () => {
      const doc = await PDFNet.PDFDoc.createFromBuffer(pdfBuffer);
      await doc.initSecurityHandler();

      const txt = await PDFNet.TextExtractor.create();
      let fullText = '';
      const pageCount = await doc.getPageCount();

      for (let i = 1; i <= pageCount; i++) {
        const page = await doc.getPage(i);
        // Correctly call getTextUnderAnnot with null as the second argument for full page extraction
        fullText += await txt.getTextUnderAnnot(page, null);
      }
      
      return fullText.trim();
    }, process.env.PDFTRON_LICENSE_KEY); // License key can be set in .env.local

    return NextResponse.json({ text: textContent });

  } catch (error) {
    console.error('Error extracting text from PDF with PDFTron:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ error: `Failed to extract text: ${errorMessage}` }, { status: 500 });
  }
}
'''