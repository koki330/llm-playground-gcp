import { NextResponse } from 'next/server';
import { firestore } from '@/services/firestore';
import { getModelsConfig } from '@/config/modelConfig';

async function getUsage(modelId: string) {
  const docRef = firestore.collection('usage_tracking').doc(modelId);
  const doc = await docRef.get();
  const year_month = new Date().toISOString().slice(0, 7);

  if (!doc.exists || doc.data()?.year_month !== year_month) {
    return { total_cost: 0, total_input_tokens: 0, total_output_tokens: 0, year_month };
  }
  return doc.data() as { total_cost: number; total_input_tokens: number; total_output_tokens: number; year_month: string };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const modelId = searchParams.get('modelId');

  if (!modelId) {
    return NextResponse.json({ error: 'modelId is required' }, { status: 400 });
  }

  try {
            const { monthlyLimitsUSD } = await getModelsConfig();
    const usage = await getUsage(modelId);
    const limit = monthlyLimitsUSD[modelId];

    return NextResponse.json({ 
      total_cost: usage.total_cost,
      total_input_tokens: usage.total_input_tokens || 0,
      total_output_tokens: usage.total_output_tokens || 0,
      limit: limit || null, // Return null if no limit is set
    });

  } catch (error) {
    console.error('Error fetching usage:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
