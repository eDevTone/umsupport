import type { ScrapeItemResult } from "./api";

/** Field of the scraped record that carries the card status label. */
const STATUS_FIELD = "vcCardStatus";

/** Status labels the portal uses for a usable card (compared case-insensitively). */
const ACTIVE_LABELS = new Set(["ACTIVA", "ACTIVE"]);

export type CardStatus = "active" | "inactive" | "unknown";

export type StatusSummary = {
    total: number;
    active: number;
    inactive: number;
    unknown: number;
    /** `true` when every card was scraped successfully and every one is active. */
    allActive: boolean;
};

/**
 * Reads the raw status label the portal returned for a card.
 *
 * @param result - Item emitted by the SSE endpoint.
 * @returns The label (e.g. `ACTIVA`), or `null` for failed scrapes or missing field.
 */
export function cardStatusLabel(result: ScrapeItemResult): string | null {
    if (result.status !== "success") return null;
    const raw = result.data?.[STATUS_FIELD];
    if (raw === null || raw === undefined || raw === "") return null;
    return String(raw).trim();
}

/**
 * Classifies a scraped card as active, inactive or unknown (scrape failed or
 * the portal did not return a status).
 *
 * @param result - Item emitted by the SSE endpoint.
 * @returns Normalized card status.
 */
export function cardStatus(result: ScrapeItemResult): CardStatus {
    const label = cardStatusLabel(result);
    if (label === null) return "unknown";
    return ACTIVE_LABELS.has(label.toUpperCase()) ? "active" : "inactive";
}

/**
 * Counts how many cards are active, inactive or unknown.
 *
 * @param results - Items emitted by the SSE endpoint.
 * @returns Totals per status plus the `allActive` flag.
 */
export function summarizeStatus(results: ScrapeItemResult[]): StatusSummary {
    const summary: StatusSummary = { total: results.length, active: 0, inactive: 0, unknown: 0, allActive: false };
    for (const r of results) summary[cardStatus(r)] += 1;
    summary.allActive = summary.total > 0 && summary.active === summary.total;
    return summary;
}

/**
 * Human-readable Spanish sentence for a status summary, used in chat messages.
 *
 * @param summary - Output of `summarizeStatus`.
 * @returns Sentence such as "Todas las tarjetas están activas (3)." or "2 activas, 1 inactiva, 1 sin datos."
 */
export function describeStatus(summary: StatusSummary): string {
    if (summary.total === 0) return "Sin tarjetas.";
    if (summary.allActive) {
        return summary.total === 1
            ? "La tarjeta está activa."
            : `Todas las tarjetas están activas (${summary.total}).`;
    }
    if (summary.total === summary.inactive) {
        return summary.total === 1
            ? "La tarjeta está inactiva."
            : `Ninguna tarjeta está activa: las ${summary.total} están inactivas.`;
    }
    const parts: string[] = [];
    parts.push(`${summary.active} ${summary.active === 1 ? "activa" : "activas"}`);
    parts.push(`${summary.inactive} ${summary.inactive === 1 ? "inactiva" : "inactivas"}`);
    if (summary.unknown > 0) parts.push(`${summary.unknown} sin datos`);
    return `${parts.join(", ")}.`;
}
