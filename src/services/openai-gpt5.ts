import OpenAI from "openai";
import type { Effort, Verbosity, Usage } from "@/types/ai";
import { isResponsesStreamEvent, extractErrorMessage } from "@/types/ai";
import { encodeTextChunk, encodeError, encodeFinish } from "@/utils/sse-encoder";
import { formatApiError } from "@/utils/api-error";

function getOpenAIClient() {
    return new OpenAI({
        apiKey: process.env.LLM_GCP_OPENAI_API_KEY!,
    });
}

type InputTextPart = { type: "input_text"; text: string };
type InputImagePart = { type: "input_image"; image_url: string; detail: "low" | "high" | "auto" };
type InputFilePart = { type: "input_file"; filename: string; file_data: string };
type UserContentPart = InputTextPart | InputImagePart | InputFilePart;

export interface Gpt5Params {
    model: string;
    messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image?: string; pdf?: string }> }>;
    reasoning?: Effort;
    verbosity?: Verbosity;
    systemPrompt?: string;
    groundingEnabled?: boolean;
}

export interface Gpt5Result {
    text: string;
    usage?: Usage;
}

// 非ストリーミング
export async function getGpt5Response(params: Gpt5Params): Promise<Gpt5Result> {
    const client = getOpenAIClient();
    const {
        model,
        messages,
        reasoning = "low",
        verbosity = "low",
        systemPrompt,
    } = params;

    // OpenAI Responses API only accepts user messages in input
    // Convert conversation history to context in system prompt
    let conversationContext = '';
    if (messages.length > 1) {
        const historyMessages = messages.slice(0, -1);
        conversationContext = '\n\n<conversation_history>\n' + 
            historyMessages.map(msg => {
                const role = msg.role === 'user' ? 'User' : 'Assistant';
                let content = '';
                if (typeof msg.content === 'string') {
                    content = msg.content;
                } else if (Array.isArray(msg.content)) {
                    content = msg.content
                        .filter(p => p.type === 'text' && p.text)
                        .map(p => p.text)
                        .join('\n');
                }
                return `${role}: ${content}`;
            }).join('\n\n') + 
            '\n</conversation_history>\n';
    }
    
    const enhancedSystemPrompt = systemPrompt ? systemPrompt + conversationContext : conversationContext;
    
    // Only send the last user message in input
    const lastMessage = messages[messages.length - 1];
    const content: UserContentPart[] = [];
    
    if (typeof lastMessage.content === 'string') {
        content.push({ type: "input_text", text: lastMessage.content });
    } else if (Array.isArray(lastMessage.content)) {
        for (const part of lastMessage.content) {
            if (part.type === 'text' && part.text) {
                content.push({ type: "input_text", text: part.text });
            } else if (part.type === 'image' && part.image) {
                content.push({ type: "input_image", image_url: part.image, detail: "auto" });
            } else if (part.type === 'pdf' && part.pdf) {
                content.push({ type: "input_file", filename: "document.pdf", file_data: part.pdf });
            }
        }
    }

    const input = [{ role: 'user' as const, content }];

    try {
        const requestBody: {
            model: string;
            input: typeof input;
            instructions?: string;
            reasoning?: { effort: "minimal" | "low" | "medium" | "high" };
            text?: { verbosity: Verbosity };
            tools?: Array<{ type: "web_search" }>;
        } = {
            model,
            input,
            instructions: enhancedSystemPrompt || undefined,
            reasoning: reasoning === "none" ? undefined : { effort: reasoning as "minimal" | "low" | "medium" | "high" },
            text: { verbosity },
        };

        // Add tools parameter if grounding is enabled
        if (params.groundingEnabled) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            requestBody.tools = [{ type: "web_search" }] as any;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await client.responses.create(requestBody as any);

        return { text: res.output_text ?? "", usage: res.usage as Usage | undefined };
    } catch (e) {
        const msg = extractErrorMessage(e);
        const shouldFallback =
            /image|input_image|vision|unsupported|not supported|unrecognized/i.test(msg);
        // Check if any message contains an image
        const hasImage = messages.some(m => 
            Array.isArray(m.content) && m.content.some(p => p.type === 'image')
        );
        if (shouldFallback && model !== "gpt-4o" && hasImage) {
            const res = await client.responses.create({
                model: "gpt-4o",
                input,
            });
            return { text: res.output_text ?? "", usage: res.usage as Usage | undefined };
        }
        throw e;
    }
}

// ストリーミング（SSEにブリッジ）
export async function streamGpt5Response(params: Gpt5Params & {
    onUsage?: (usage: Usage) => Promise<void> | void;
}): Promise<ReadableStream<Uint8Array>> {
    const client = getOpenAIClient();
    const {
        model,
        messages,
        reasoning = "low",
        verbosity = "low",
        systemPrompt,
        onUsage,
    } = params;

    // OpenAI Responses API only accepts user messages in input
    // Convert conversation history to context in system prompt
    let conversationContext = '';
    if (messages.length > 1) {
        const historyMessages = messages.slice(0, -1);
        conversationContext = '\n\n<conversation_history>\n' + 
            historyMessages.map(msg => {
                const role = msg.role === 'user' ? 'User' : 'Assistant';
                let content = '';
                if (typeof msg.content === 'string') {
                    content = msg.content;
                } else if (Array.isArray(msg.content)) {
                    content = msg.content
                        .filter(p => p.type === 'text' && p.text)
                        .map(p => p.text)
                        .join('\n');
                }
                return `${role}: ${content}`;
            }).join('\n\n') + 
            '\n</conversation_history>\n';
    }
    
    const enhancedSystemPrompt = systemPrompt ? systemPrompt + conversationContext : conversationContext;
    
    // Only send the last user message in input
    const lastMessage = messages[messages.length - 1];
    const content: UserContentPart[] = [];
    
    if (typeof lastMessage.content === 'string') {
        content.push({ type: "input_text", text: lastMessage.content });
    } else if (Array.isArray(lastMessage.content)) {
        for (const part of lastMessage.content) {
            if (part.type === 'text' && part.text) {
                content.push({ type: "input_text", text: part.text });
            } else if (part.type === 'image' && part.image) {
                content.push({ type: "input_image", image_url: part.image, detail: "auto" });
            } else if (part.type === 'pdf' && part.pdf) {
                content.push({ type: "input_file", filename: "document.pdf", file_data: part.pdf });
            }
        }
    }

    const input = [{ role: 'user' as const, content }];

    async function run(modelToUse: string): Promise<ReadableStream<Uint8Array>> {
        const requestBody: {
            model: string;
            input: typeof input;
            instructions?: string;
            reasoning?: { effort: "minimal" | "low" | "medium" | "high" };
            text?: { verbosity: Verbosity };
            tools?: Array<{ type: "web_search" }>;
        } = {
            model: modelToUse,
            input,
            instructions: enhancedSystemPrompt || undefined,
            reasoning: reasoning === "none" ? undefined : { effort: reasoning as "minimal" | "low" | "medium" | "high" },
            text: { verbosity },
        };

        // Add tools parameter if grounding is enabled
        if (params.groundingEnabled) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            requestBody.tools = [{ type: "web_search" }] as any;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stream = await client.responses.stream(requestBody as any);

        return new ReadableStream<Uint8Array>({
            async start(controller) {
                try {
                    // イベントを逐次SSE行に変換（"0:" はテキストチャンク）
                    for await (const ev of stream as unknown as AsyncIterable<unknown>) {
                        if (!isResponsesStreamEvent(ev)) continue;

                        if (ev.type === "response.output_text.delta") {
                            controller.enqueue(encodeTextChunk(ev.delta));
                        } else if (ev.type === "response.completed") {
                            const usage = ev.response?.usage;
                            if (usage && onUsage) await onUsage(usage);
                        } else if (ev.type === "response.error") {
                            controller.enqueue(encodeError(formatApiError(ev.error)));
                        }
                    }
                } finally {
                    await stream.done().catch(() => void 0);
                    controller.enqueue(encodeFinish());
                    controller.close();
                }
            },
        });
    }

    try {
        return await run(model);
    } catch (e) {
        const msg = extractErrorMessage(e);
        const shouldFallback =
            /image|input_image|vision|unsupported|not supported|unrecognized/i.test(msg);
        // Check if any message contains an image
        const hasImage = messages.some(m => 
            Array.isArray(m.content) && m.content.some(p => p.type === 'image')
        );
        if (shouldFallback && model !== "gpt-4o" && hasImage) {
            return await run("gpt-4o");
        }
        throw e;
    }
}
