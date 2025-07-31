import { CoreMessage } from 'ai';

// Re-exporting CoreMessage allows us to use it as the base for our application's message type.
// This ensures compatibility with the Vercel AI SDK.
export type Message = CoreMessage;

// If you need to add custom properties to messages in your UI, you can extend it:
/*
export type AppMessage = CoreMessage & {
  id: string; // Example: adding a unique ID for React keys
  // any other custom properties...
};
*/
