import type { ScrapeItemResult } from "./api";

/**
 * A piece of the rendered SQL. `static` segments come from the template,
 * `value` segments were substituted from the scrape result or the user's
 * input, and `missing` marks a value that could not be resolved.
 */
export type QuerySegment = {
    text: string;
    kind: "static" | "value";
    field?: string;
    missing?: boolean;
};

/**
 * Field mapping between the scraped OneCard record and the columns of the
 * activation `UPDATE`. Change here if the portal renames a field.
 */
const SOURCE_FIELDS = {
    external_id: "biAccount",
    external_process_id: "biAccount",
    user_id_for_card: "vcEmployee",
} as const;

/** Number of leading characters of the username used as card alias prefix. */
const ALIAS_PREFIX_LENGTH = 3;

function escapeSql(value: string): string {
    return value.replace(/'/g, "''");
}

function readField(data: Record<string, unknown> | null | undefined, key: string): string | null {
    const raw = data?.[key];
    if (raw === null || raw === undefined || raw === "") return null;
    return String(raw);
}

function value(field: string, resolved: string | null): QuerySegment {
    return resolved === null
        ? { text: `<${field}>`, kind: "value", field, missing: true }
        : { text: escapeSql(resolved), kind: "value", field };
}

/**
 * Builds the activation query for one scraped card as a list of segments so
 * the UI can highlight which parts were substituted.
 *
 * @param result - Successful item emitted by the SSE endpoint.
 * @param username - Portal username typed by the user next to the card, if any.
 * @returns Ordered segments that concatenate into the full `UPDATE` statement.
 */
export function buildActivationSegments(
    result: ScrapeItemResult,
    username?: string,
): QuerySegment[] {
    const data = result.data ?? null;
    const account = readField(data, SOURCE_FIELDS.external_id);
    const employeeId = readField(data, SOURCE_FIELDS.user_id_for_card);
    const user = username?.trim() || null;
    const prefix = user ? user.slice(0, ALIAS_PREFIX_LENGTH) : null;

    const s = (text: string): QuerySegment => ({ text, kind: "static" });

    return [
        s("UPDATE cards\nSET card_alias = CONCAT('"),
        value("alias_prefix", prefix),
        s("', SUBSTR(card_id, 11)),\n"),
        s("    active = true,\n"),
        s("    default_card = true,\n"),
        s("    default_priority = 1,\n"),
        s("    external_status_id = 'ACTIVA',\n"),
        s("    external_id = '"),
        value("external_id", account),
        s("',\n    external_process_id = '"),
        value("external_process_id", account),
        s("',\n    user_id_for_card = '"),
        value("user_id_for_card", employeeId),
        s("',\n    activation_date = NOW(),\n"),
        s("    member_id = (\n      SELECT m.member_id\n      FROM members m\n      WHERE m.username = '"),
        value("username", user),
        s("'\n    )\nWHERE card_id IN ('"),
        value("card_id", result.card),
        s("');"),
    ];
}

/**
 * Serializes query segments into plain SQL text.
 *
 * @param segments - Output of `buildActivationSegments`.
 * @returns The SQL statement as a string.
 */
export function segmentsToSql(segments: QuerySegment[]): string {
    return segments.map((seg) => seg.text).join("");
}

/**
 * Checks whether any substituted value could not be resolved.
 *
 * @param segments - Output of `buildActivationSegments`.
 * @returns `true` when at least one value is missing.
 */
export function hasMissingValues(segments: QuerySegment[]): boolean {
    return segments.some((seg) => seg.missing);
}

/**
 * Builds the SQL for one result, or a SQL comment when the scrape failed.
 *
 * @param result - Item emitted by the SSE endpoint.
 * @param username - Portal username typed by the user next to the card, if any.
 * @returns SQL statement, or a `--` comment line for failed cards.
 */
export function activationSqlFor(result: ScrapeItemResult, username?: string): string {
    if (result.status !== "success") {
        const code = result.error_code ?? "ERROR";
        const msg = result.message ? ` ${result.message}` : "";
        return `-- #${result.index + 1} ${result.card}: ${code}.${msg}`;
    }
    return segmentsToSql(buildActivationSegments(result, username));
}

/**
 * Concatenates the activation SQL for every result, separated by blank lines,
 * so the whole batch can be pasted into a SQL client at once.
 *
 * @param entries - Results paired with the username typed for each card.
 * @returns Multi-statement SQL script.
 */
export function activationSqlForAll(
    entries: { result: ScrapeItemResult; username?: string }[],
): string {
    return entries.map(({ result, username }) => activationSqlFor(result, username)).join("\n\n");
}
