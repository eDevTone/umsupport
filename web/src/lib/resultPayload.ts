import type { ScrapeItemResult } from "./api";

/**
 * Shape of a single result once prepared for the clipboard. Successful
 * results expose the raw scraped record; failed ones expose a compact
 * error object so the array keeps one entry per card, in order.
 */
export type ResultPayload =
    | Record<string, unknown>
    | { card: string; status: "error"; error_code: string | null; message: string | null };

/**
 * Converts a stream result into the object the user actually wants to copy.
 *
 * @param result - Item emitted by the SSE endpoint.
 * @returns Scraped record on success, or a compact error object on failure.
 */
export function toPayload(result: ScrapeItemResult): ResultPayload {
    if (result.status === "success" && result.data) {
        return result.data;
    }
    return {
        card: result.card,
        status: "error",
        error_code: result.error_code ?? null,
        message: result.message ?? null,
    };
}

/**
 * Serializes one result as pretty-printed JSON.
 *
 * @param result - Item emitted by the SSE endpoint.
 * @returns JSON string with 2-space indentation.
 */
export function serializeOne(result: ScrapeItemResult): string {
    return JSON.stringify(toPayload(result), null, 2);
}

/**
 * Serializes a list of results as a JSON array, preserving order.
 *
 * @param results - Items emitted by the SSE endpoint.
 * @returns JSON array string with 2-space indentation.
 */
export function serializeAll(results: ScrapeItemResult[]): string {
    return JSON.stringify(results.map(toPayload), null, 2);
}
