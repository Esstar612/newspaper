import type { Message, TextBlock } from "@anthropic-ai/sdk/resources/messages";

export function makeMessage(content: TextBlock[], stop_reason: Message["stop_reason"] = "end_turn"): Message {
    return {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5",
        container: null,
        diagnostics: null,
        content,
        stop_reason,
        stop_sequence: null,
        stop_details: null,
        usage: {
            input_tokens: 1200,
            output_tokens: 80,
            cache_creation: null,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
            inference_geo: null,
            output_tokens_details: null,
            server_tool_use: null,
            service_tier: "standard",
        },
    };
}

export const textBlock = (text: string, citations: TextBlock["citations"] = null): TextBlock => ({
    type: "text",
    text,
    citations,
});
