import { firestore } from '@/services/firestore';
import { FieldValue } from '@google-cloud/firestore';

function getDocRef(modelId: string) {
  return firestore.collection('usage_tracking').doc(modelId);
}

function formatTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  return `${year}/${month}/${day}/${hours}:${minutes}`;
}

const EMPTY_MONTH_DOC = (yearMonth: string) => ({
  total_cost: 0,
  total_input_tokens: 0,
  total_output_tokens: 0,
  year_month: yearMonth,
  daily_costs: {},
  daily_input_tokens: {},
  daily_output_tokens: {},
  last_updated: '',
});

export interface UsageData {
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  year_month: string;
}

export async function getUsage(modelId: string): Promise<UsageData> {
  const docRef = getDocRef(modelId);
  const doc = await docRef.get();
  const yearMonth = new Date().toISOString().slice(0, 7);

  if (!doc.exists || doc.data()?.year_month !== yearMonth) {
    await docRef.set({ ...EMPTY_MONTH_DOC(yearMonth), last_updated: formatTimestamp() });
    return { total_cost: 0, total_input_tokens: 0, total_output_tokens: 0, year_month: yearMonth };
  }
  return doc.data() as UsageData;
}

export async function updateUsage(
  modelId: string,
  inputTokens: number = 0,
  outputTokens: number = 0,
  pricing: { input: number; output: number },
): Promise<void> {
  const safeInputTokens = inputTokens || 0;
  const safeOutputTokens = outputTokens || 0;
  if (!pricing) {
    console.warn(`No pricing info for model ${modelId}. Skipping usage update.`);
    return;
  }

  const inputCost = (safeInputTokens / 1_000_000) * pricing.input;
  const outputCost = (safeOutputTokens / 1_000_000) * pricing.output;
  const requestCost = inputCost + outputCost;

  const docRef = getDocRef(modelId);
  const currentMonth = new Date().toISOString().slice(0, 7);

  const doc = await docRef.get();
  if (doc.exists) {
    const docData = doc.data();
    if (docData && docData.year_month && docData.year_month !== currentMonth) {
      await docRef.set(EMPTY_MONTH_DOC(currentMonth));
    }
  } else {
    await docRef.set(EMPTY_MONTH_DOC(currentMonth));
  }

  const today = new Date().toISOString().slice(0, 10);
  await docRef.update({
    total_cost: FieldValue.increment(requestCost),
    total_input_tokens: FieldValue.increment(safeInputTokens),
    total_output_tokens: FieldValue.increment(safeOutputTokens),
    [`daily_costs.${today}`]: FieldValue.increment(requestCost),
    [`daily_input_tokens.${today}`]: FieldValue.increment(safeInputTokens),
    [`daily_output_tokens.${today}`]: FieldValue.increment(safeOutputTokens),
    last_updated: formatTimestamp(),
  });
}
