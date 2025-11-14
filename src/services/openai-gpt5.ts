import OpenAI from "openai";
import type { Effort, Verbosity, Usage } from "@/types/ai";
import { isResponsesStreamEvent, extractErrorMessage } from "@/types/ai";

function getOpenAIClient() {
    return new OpenAI({
        apiKey: process.env.LLM_GCP_OPENAI_API_KEY!,
    });
}

type InputTextPart = { type: "input_text"; text: string };
type InputImagePart = { type: "input_image"; image_url: string; detail: "low" | "high" | "auto" };
type UserContentPart = InputTextPart | InputImagePart;

export interface Gpt5Params {
    model: string;
    prompt: string;
    imageUrlOrDataUrl?: string;
    reasoning?: Effort;
    verbosity?: Verbosity;
    systemPrompt?: string;
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
        prompt,
        imageUrlOrDataUrl,
        reasoning = "low",
        verbosity = "low",
        systemPrompt,
    } = params;

    const content: UserContentPart[] = [{ type: "input_text", text: prompt }];
    if (imageUrlOrDataUrl) {
        content.push({ type: "input_image", image_url: imageUrlOrDataUrl, detail: "auto" });
    }

    try {
        const res = await client.responses.create({
            model,
            input: [{ role: "user", content }],
            instructions: systemPrompt,
            reasoning: reasoning === "none" ? undefined : { effort: reasoning as "minimal" | "low" | "medium" | "high" },
            text: { verbosity },
        });

        return { text: res.output_text ?? "", usage: res.usage as Usage | undefined };
    } catch (e) {
        const msg = extractErrorMessage(e);
        const shouldFallback =
            /image|input_image|vision|unsupported|not supported|unrecognized/i.test(msg);
        if (shouldFallback && model !== "gpt-4o" && imageUrlOrDataUrl) {
            const res = await client.responses.create({
                model: "gpt-4o",
                input: [{ role: "user", content }],
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
        prompt,
        imageUrlOrDataUrl,
        reasoning = "low",
        verbosity = "low",
        systemPrompt,
        onUsage,
    } = params;

    const content: UserContentPart[] = [{ type: "input_text", text: prompt }];
    if (imageUrlOrDataUrl) {
        content.push({ type: "input_image", image_url: imageUrlOrDataUrl, detail: "auto" });
    }

    const encoder = new TextEncoder();

    async function run(modelToUse: string): Promise<ReadableStream<Uint8Array>> {
        const stream = await client.responses.stream({
            model: modelToUse,
            input: [{ role: "user", content }],
            instructions: systemPrompt,
            reasoning: reasoning === "none" ? undefined : { effort: reasoning as "minimal" | "low" | "medium" | "high" },
            text: { verbosity },
        });

        return new ReadableStream<Uint8Array>({
            async start(controller) {
                try {
                    // イベントを逐次SSE行に変換（"0:" はテキストチャンク）
                    for await (const ev of stream as unknown as AsyncIterable<unknown>) {
                        if (!isResponsesStreamEvent(ev)) continue;

                        if (ev.type === "response.output_text.delta") {
                            controller.enqueue(encoder.encode(`0:${JSON.stringify(ev.delta)}\n`));
                        } else if (ev.type === "response.completed") {
                            const usage = ev.response?.usage;
                            if (usage && onUsage) await onUsage(usage);
                        } else if (ev.type === "response.error") {
                            const message = ev.error?.message ?? "error";
                            controller.enqueue(encoder.encode(`e:${JSON.stringify(message)}\n`));
                        }
                    }
                } finally {
                    await stream.done().catch(() => void 0);
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
        if (shouldFallback && model !== "gpt-4o" && imageUrlOrDataUrl) {
            return await run("gpt-4o");
        }
        throw e;
    }
}
