import { Storage } from '@google-cloud/storage';
import { NextResponse } from 'next/server';

// Explicitly use credentials for local development if the env var is set.
// In Cloud Run, the env var will be undefined, and the library will fall back
// to using the attached service account automatically (ADC).
const serviceAccountJson = process.env.LLM_GCP_VERTEX_AI_SERVICE_ACCOUNT_JSON;
const credentials = serviceAccountJson ? JSON.parse(serviceAccountJson) : undefined;

const storage = new Storage({
  credentials,
});

// Get the bucket name from an environment variable
const bucketName = process.env.LLM_GCP_GCS_BUCKET_NAME;
console.log(`[DEBUG] generate-upload-url: Initializing. Bucket name from env is: "${bucketName}"`);

export async function POST(req: Request) {
  console.log(`[DEBUG] generate-upload-url: POST request received. Bucket name is: "${bucketName}"`);
  if (!bucketName) {
    console.error('[ERROR] generate-upload-url: GCS_BUCKET_NAME is not set or empty. Failing request.');
    return NextResponse.json({ error: 'GCS_BUCKET_NAME environment variable not set.' }, { status: 500 });
  }

  try {
    const { fileName, contentType } = await req.json();

    if (!fileName || !contentType) {
      return NextResponse.json({ error: 'fileName and contentType are required.' }, { status: 400 });
    }

    // Configure the options for the signed URL
    const options = {
      version: 'v4' as const,
      action: 'write' as const,
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: contentType,
    };

    // Get a v4 signed URL for uploading a file
    const [url] = await storage
      .bucket(bucketName)
      .file(fileName)
      .getSignedUrl(options);

    return NextResponse.json({ uploadUrl: url, gcsUri: `gs://${bucketName}/${fileName}` });

  } catch (error) {
    console.error('Error generating signed URL:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ error: `Failed to generate upload URL: ${errorMessage}` }, { status: 500 });
  }
}