import { Storage } from '@google-cloud/storage';
import { NextRequest, NextResponse } from 'next/server';

// GCSクライアントを初期化
const storage = new Storage();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileName, contentType } = body;

    if (!fileName || !contentType) {
      return NextResponse.json({ error: 'fileName and contentType are required' }, { status: 400 });
    }

    const bucketName = process.env.GCS_BUCKET_NAME;
    if (!bucketName) {
      throw new Error('GCS_BUCKET_NAME environment variable not set.');
    }

    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);

    // 署名付きURLのオプションを設定
    const options = {
      version: 'v4' as const,
      action: 'write' as const,
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: contentType,
    };

    // 署名付きURLを生成
    const [signedUrl] = await file.getSignedUrl(options);

    // 公開URLを構築
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;

    return NextResponse.json({ signedUrl, publicUrl });

  } catch (error) {
    console.error('Error creating signed URL:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to create signed URL', details: errorMessage }, { status: 500 });
  }
}
