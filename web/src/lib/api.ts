import type { ScrapeItem } from "./parseInput";

const API_URL = import.meta.env.PUBLIC_API_URL ?? "http://localhost:8000";

export type ScrapeItemResult = {
    index: number;
    card: string;
    status: "success" | "error";
    data?: Record<string, unknown> | null;
    error_code?: string | null;
    message?: string | null;
    duration_ms: number;
};

/**
 * Calls the backend SSE endpoint and emits each result as it arrives.
 *
 * Uses fetch + ReadableStream because the native EventSource API does not
 * support POST. Parses the SSE frames manually (`data:` and `event:` blocks
 * separated by `\n\n`).
 *
 * @param items - List of cards to process.
 * @param onResult - Callback invoked with every individual result.
 * @param signal - Optional AbortSignal to cancel the stream.
 * @returns Promise that resolves when the backend emits the `done` event.
 */
export async function scrapeStream(
    items: ScrapeItem[],
    onResult: (result: ScrapeItemResult) => void,
    signal?: AbortSignal,
): Promise<void> {
    const response = await fetch(`${API_URL}/api/scrape/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
        signal,
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Backend returned ${response.status}: ${text || response.statusText}`);
    }

    if (!response.body) {
        throw new Error("Response has no body (streaming not supported).");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let sepIndex: number;
            while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
                const rawEvent = buffer.slice(0, sepIndex);
                buffer = buffer.slice(sepIndex + 2);
                const parsed = parseSseEvent(rawEvent);
                if (!parsed) continue;
                if (parsed.event === "done") return;
                if (parsed.data) {
                    try {
                        const result = JSON.parse(parsed.data) as ScrapeItemResult;
                        onResult(result);
                    } catch {
                        // ignore malformed frames instead of tearing down the stream
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

function parseSseEvent(raw: string): { event?: string; data?: string } | null {
    if (!raw.trim()) return null;
    let event: string | undefined;
    const dataLines: string[] = [];

    for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) {
            event = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
        }
    }

    return { event, data: dataLines.length ? dataLines.join("\n") : undefined };
}
