export type Effort = "none" | "minimal" | "low" | "medium" | "high";
export type Verbosity = "low" | "medium" | "high";
export type Gemini3ThinkingLevel = "low" | "high";

// Vercel AI SDK で使うメッセージパート
export interface AiTextPart { type: "text"; text: string }
export interface AiImagePart { type: "image"; imageUrl: string }
export type AiContentPart = AiTextPart | AiImagePart;

// OpenAI Responses API の usage をカバー（実際のキー名が環境で揺れるため両対応）
export interface Usage {
    input_tokens?: number;
    output_tokens?: number;
    input_text_tokens?: number;
    output_text_tokens?: number;
}

// Responses API のストリームイベント（使用する最小限）
export type ResponsesStreamEvent =
    | { type: "response.output_text.delta"; delta: string }
    | { type: "response.completed"; response?: { usage?: Usage } }
    | { type: "response.error"; error?: { message?: string } };

// 型ガード
export function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

export function isAiTextPart(v: unknown): v is AiTextPart {
    if (!isRecord(v)) return false;
    return v.type === "text" && typeof v.text === "string";
}

export function isAiImagePart(v: unknown): v is AiImagePart {
    if (!isRecord(v)) return false;
    return v.type === "image" && typeof v.imageUrl === "string";
}

export function isResponsesStreamEvent(v: unknown): v is ResponsesStreamEvent {
    if (!isRecord(v) || typeof v.type !== "string") return false;
    switch (v.type) {
        case "response.output_text.delta":
            return typeof v.delta === "string";
        case "response.completed":
            return true; // usage は任意
        case "response.error":
            return true; // error.message は任意
        default:
            return false;
    }
}

export function extractErrorMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    try {
        return JSON.stringify(e);
    } catch {
        return String(e);
    }
}
