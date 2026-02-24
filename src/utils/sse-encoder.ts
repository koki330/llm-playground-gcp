const encoder = new TextEncoder();

/** Encode a text chunk in Vercel AI SDK data stream format (`0:` prefix = text). */
export function encodeTextChunk(text: string): Uint8Array {
  return encoder.encode(`0:${JSON.stringify(text)}\n`);
}

/** Encode an error message in Vercel AI SDK data stream format (`3:` prefix = error). */
export function encodeError(message: string): Uint8Array {
  return encoder.encode(`3:${JSON.stringify(message)}\n`);
}

/** Encode finish_step + finish_message in Vercel AI SDK data stream format. */
export function encodeFinish(finishReason: string = 'stop'): Uint8Array {
  const step = `e:${JSON.stringify({ finishReason })}\n`;
  const message = `d:${JSON.stringify({ finishReason })}\n`;
  return encoder.encode(step + message);
}
