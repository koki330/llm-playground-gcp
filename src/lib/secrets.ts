import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const client = new SecretManagerServiceClient();
const secretCache = new Map<string, string>();

export async function getSecret(secretName: string): Promise<string | null> {
  if (secretCache.has(secretName)) {
    return secretCache.get(secretName) ?? null;
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    console.error('GOOGLE_CLOUD_PROJECT environment variable not set.');
    return null;
  }

  try {
    const [version] = await client.accessSecretVersion({
      name: `projects/${projectId}/secrets/${secretName}/versions/latest`,
    });

    const payload = version.payload?.data?.toString();
    if (payload) {
      secretCache.set(secretName, payload);
      return payload;
    }

    return null;
  } catch (error) {
    console.error(`Failed to access secret "${secretName}":`, error);
    return null;
  }
}
