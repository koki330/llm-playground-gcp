import { Firestore, FieldValue } from '@google-cloud/firestore';

const firestore = new Firestore();
const USAGE_COLLECTION = 'llm-usage';
const COST_COLLECTION = 'usage_tracker';

// --- Usage Tracking --- 

export async function trackUsage(modelId: string, inputTokens: number, outputTokens: number): Promise<void> {
  try {
    const usageCollection = firestore.collection(USAGE_COLLECTION);
    await usageCollection.add({
      modelId,
      inputTokens,
      outputTokens,
      timestamp: FieldValue.serverTimestamp(),
    });
    console.log(`Successfully tracked usage for model: ${modelId}`);
  } catch (error) {
    console.error('Failed to track usage in Firestore:', error);
  }
}

// --- Cost Management --- 

export interface MonthlyCosts {
  gemini_2_5_pro_cost: number;
  total_cost: number;
}

function getMonthId(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export async function getMonthlyCosts(): Promise<MonthlyCosts> {
  const monthId = getMonthId();
  const docRef = firestore.collection(COST_COLLECTION).doc(monthId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { gemini_2_5_pro_cost: 0, total_cost: 0 };
  }
  return doc.data() as MonthlyCosts;
}

export async function updateMonthlyCosts(costUpdate: { gemini_cost_increase: number; total_cost_increase: number }): Promise<void> {
  const monthId = getMonthId();
  const docRef = firestore.collection(COST_COLLECTION).doc(monthId);

  try {
    await docRef.set({
      gemini_2_5_pro_cost: FieldValue.increment(costUpdate.gemini_cost_increase),
      total_cost: FieldValue.increment(costUpdate.total_cost_increase),
      lastUpdated: FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log('Successfully updated monthly costs.');
  } catch (error) {
    console.error('Failed to update costs in Firestore:', error);
  }
}