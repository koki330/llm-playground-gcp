import { Storage } from '@google-cloud/storage';

const storage = new Storage();

/**
 * Downloads a file from GCS into a buffer.
 * @param bucketName The GCS bucket name.
 * @param fileName The name of the file to download.
 * @returns A promise that resolves with the file's contents as a Buffer.
 */
export async function downloadFromGcs(bucketName: string, fileName: string): Promise<Buffer> {
  try {
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);
    const [data] = await file.download();
    return data;
  } catch (error) {
    console.error(`Failed to download file from GCS: gs://${bucketName}/${fileName}`, error);
    throw new Error('Could not retrieve file from storage.');
  }
}
