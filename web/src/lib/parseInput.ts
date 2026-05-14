export type ScrapeItem = {
    card: string;
};

export type ParseLineError = {
    line: number;
    raw: string;
    reason: string;
};

export type ParseResult = {
    items: ScrapeItem[];
    errors: ParseLineError[];
};

const CARD_REGEX = /^\d{12,19}$/;

/**
 * Parses multi-line text where each line contains a single card number.
 * Empty lines are ignored.
 *
 * @param raw - Raw text pasted by the user in the textarea.
 * @returns Valid card items and per-line errors with line number and reason.
 */
export function parseInput(raw: string): ParseResult {
    const items: ScrapeItem[] = [];
    const errors: ParseLineError[] = [];

    const lines = raw.split(/\r?\n/);
    lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        const card = trimmed.replace(/[\s\-]/g, "");

        if (!CARD_REGEX.test(card)) {
            errors.push({
                line: idx + 1,
                raw: trimmed,
                reason: "Tarjeta inválida. Debe contener entre 12 y 19 dígitos.",
            });
            return;
        }

        items.push({ card });
    });

    return { items, errors };
}
