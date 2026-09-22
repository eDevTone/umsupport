export type ScrapeItem = {
    card: string;
    /** Portal username of the employee that owns the card. Optional; only needed to build the activation query. */
    username?: string;
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
const FIELD_SEPARATOR = /[,;|\t]/;

/**
 * Parses multi-line text where each line contains a card number and,
 * optionally, the employee username separated by a comma, semicolon, pipe
 * or tab (`5062990506414370,sha645627@yopmail.com`). Empty lines are ignored.
 *
 * @param raw - Raw text pasted by the user in the textarea.
 * @returns Valid items and per-line errors with line number and reason.
 */
export function parseInput(raw: string): ParseResult {
    const items: ScrapeItem[] = [];
    const errors: ParseLineError[] = [];

    const lines = raw.split(/\r?\n/);
    lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        const [rawCard = "", rawUser = ""] = trimmed.split(FIELD_SEPARATOR, 2);
        const card = rawCard.replace(/[\s\-]/g, "");
        const username = rawUser.trim();

        if (!CARD_REGEX.test(card)) {
            errors.push({
                line: idx + 1,
                raw: trimmed,
                reason: "Tarjeta inválida. Debe contener entre 12 y 19 dígitos.",
            });
            return;
        }

        items.push(username ? { card, username } : { card });
    });

    return { items, errors };
}
