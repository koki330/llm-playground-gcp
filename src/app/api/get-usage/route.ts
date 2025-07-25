import { NextResponse } from 'next/server';
import { firestore } from '@/services/firestore';

const MONTHLY_LIMITS_USD: { [key: string]: number } = {
  'claude-sonnet4': 120,
  'o3': 300,
};

async function getUsage(modelId: string) {
  const docRef = firestore.collection('usage_tracking').doc(modelId);
  const doc = await docRef.get();
  const year_month = new Date().toISOString().slice(0, 7);

  if (!doc.exists || doc.data()?.year_month !== year_month) {
    return { total_cost: 0, year_month };
  }
  return doc.data() as { total_cost: number; year_month: string };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const modelId = searchParams.get('modelId');

  if (!modelId) {
    return NextResponse.json({ error: 'modelId is required' }, { status: 400 });
  }

  try {
    const usage = await getUsage(modelId);
    const limit = MONTHLY_LIMITS_USD[modelId];

    return NextResponse.json({ 
      total_cost: usage.total_cost,
      limit: limit || null, // Return null if no limit is set
    });

  } catch (error) {
    console.error('Error fetching usage:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
