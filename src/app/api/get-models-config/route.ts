import { NextResponse } from 'next/server';
import { getModelsConfig } from '@/config/modelConfig';

export async function GET() {
  try {
            const config = await getModelsConfig();
    return NextResponse.json(config);
  } catch (error) {
    console.error('[API /get-models-config] Failed to load configuration:', error);
    return NextResponse.json(
      { error: 'Could not load model configuration.' },
      { status: 500 }
    );
  }
}
