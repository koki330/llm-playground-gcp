import { Firestore } from '@google-cloud/firestore';

// Initialize Firestore with the specific database ID provided by the user.
// The project ID and credentials will be automatically discovered from the environment.
const firestore = new Firestore({
  databaseId: 'llmplayground',
});

export { firestore };