
import { NextRequest, NextResponse } from 'next/server';
import { firestore } from '@/services/firestore';
import { FieldValue } from '@google-cloud/firestore';
import { getPricing } from '@/config/pricing';

// This is the same usage tracking logic from the chat API.
const usageTracker = {
    getDocRef: (modelId: string) => firestore.collection('usage_tracking').doc(modelId),
    updateUsage: async (modelId: string, inputTokens?: number, outputTokens?: number) => {
        const safeInputTokens = inputTokens || 0;
        const safeOutputTokens = outputTokens || 0;
        const pricing = getPricing(modelId);
        if (!pricing) {
          throw new Error(`No pricing info for model ${modelId}.`);
        }
        const inputCost = (safeInputTokens / 1_000_000) * pricing.input;
        const outputCost = (safeOutputTokens / 1_000_000) * pricing.output;
        const requestCost = inputCost + outputCost;
        console.log(`[DEBUG] Recording usage for ${modelId}: ${requestCost}`); // <-- DEBUG LOG
        const docRef = usageTracker.getDocRef(modelId);
        const today = new Date().toISOString().slice(0, 10);
        const dailyCostField = `daily_costs.${today}`;
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const lastUpdatedTimestamp = `${year}/${month}/${day}/${hours}:${minutes}`;
        
        const doc = await docRef.get();
        if (!doc.exists) {
            const year_month = new Date().toISOString().slice(0, 7);
            await docRef.set({ total_cost: 0, year_month, daily_costs: {}, last_updated: '' });
        }

        await docRef.update({
          total_cost: FieldValue.increment(requestCost),
          [dailyCostField]: FieldValue.increment(requestCost),
          last_updated: lastUpdatedTimestamp,
        });
    },
};

interface RecordUsageBody {
    modelId: string;
    promptTokens: number;
    completionTokens: number;
}

export async function POST(req: NextRequest) {
    try {
        const body: RecordUsageBody = await req.json();
        const { modelId, promptTokens, completionTokens } = body;

        if (!modelId || promptTokens === undefined || completionTokens === undefined) {
            return NextResponse.json({ error: 'modelId and token counts are required' }, { status: 400 });
        }

        await usageTracker.updateUsage(modelId, promptTokens, completionTokens);

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('[ERROR] in /api/record-usage:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        return NextResponse.json({ error: `Failed to record usage: ${errorMessage}` }, { status: 500 });
    }
}
