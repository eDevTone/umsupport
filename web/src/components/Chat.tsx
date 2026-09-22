import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle2, CircleSlash, Copy, Loader2, Send, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useCopy } from "@/hooks/useCopy";
import { scrapeStream, type ScrapeItemResult } from "@/lib/api";
import {
    activationSqlFor,
    activationSqlForAll,
    buildActivationSegments,
    hasMissingValues,
} from "@/lib/activationQuery";
import {
    cardStatus,
    cardStatusLabel,
    describeStatus,
    summarizeStatus,
    type StatusSummary,
} from "@/lib/cardStatus";
import { parseInput, type ParseLineError, type ScrapeItem } from "@/lib/parseInput";
import { serializeAll, serializeOne } from "@/lib/resultPayload";
import { cn } from "@/lib/utils";

type UserMessage = { kind: "user"; text: string };
type SystemMessage = {
    kind: "system";
    text: string;
    tone?: "info" | "warning" | "error";
    errors?: ParseLineError[];
};
type ResultMessage = { kind: "result"; result: ScrapeItemResult; username?: string };

type ChatMessage = UserMessage | SystemMessage | ResultMessage;

/** What the result bubbles show and what the copy buttons put on the clipboard. */
type ViewMode = "json" | "sql";

const INTRO_TEXT =
    "Pega una lista de tarjetas (una por línea). Añade el usuario del empleado tras una coma para generar la query de activación: 5062990506414370,sha645627@yopmail.com";

/**
 * Main chat component. Owns the message list state, parses the user's pasted
 * input, streams scrape results from the backend and lets the user copy each
 * result (or all of them) either as JSON or as the activation SQL.
 *
 * @returns React element with the chat UI (messages + textarea + button).
 */
export default function Chat() {
    const [messages, setMessages] = useState<ChatMessage[]>([
        { kind: "system", text: INTRO_TEXT, tone: "info" },
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>("json");
    const scrollRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const pushMessage = useCallback((msg: ChatMessage) => {
        setMessages((prev) => [...prev, msg]);
    }, []);

    const handleSubmit = useCallback(async () => {
        if (!input.trim() || isLoading) return;

        const { items, errors } = parseInput(input);
        pushMessage({ kind: "user", text: input });
        setInput("");

        if (errors.length > 0) {
            pushMessage({
                kind: "system",
                text: `${errors.length} línea(s) con problemas:`,
                tone: "warning",
                errors,
            });
        }

        if (items.length === 0) {
            pushMessage({
                kind: "system",
                text: "No hay tarjetas válidas para procesar.",
                tone: "error",
            });
            return;
        }

        pushMessage({
            kind: "system",
            text: `Procesando ${items.length} ${items.length === 1 ? "tarjeta" : "tarjetas"}…`,
            tone: "info",
        });

        setIsLoading(true);
        const controller = new AbortController();
        abortRef.current = controller;

        const batch: ScrapeItemResult[] = [];
        try {
            await scrapeStream(
                items as ScrapeItem[],
                (result) => {
                    batch.push(result);
                    pushMessage({ kind: "result", result, username: items[result.index]?.username });
                },
                controller.signal,
            );

            pushMessage({
                kind: "system",
                text: `Listo. ${describeStatus(summarizeStatus(batch))}`,
                tone: "info",
            });
        } catch (err) {
            if (controller.signal.aborted) {
                pushMessage({
                    kind: "system",
                    text: "Procesamiento cancelado.",
                    tone: "warning",
                });
            } else {
                pushMessage({
                    kind: "system",
                    text: `Error: ${err instanceof Error ? err.message : "desconocido"}`,
                    tone: "error",
                });
            }
        } finally {
            setIsLoading(false);
            abortRef.current = null;
        }
    }, [input, isLoading, pushMessage]);

    const handleCancel = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const results = useMemo(
        () => messages.flatMap((m) => (m.kind === "result" ? [m] : [])),
        [messages],
    );
    const summary = useMemo(() => summarizeStatus(results.map((m) => m.result)), [results]);
    const [copiedAll, copyAll] = useCopy();
    const handleCopyAll = useCallback(() => {
        if (results.length === 0) return;
        const text =
            viewMode === "sql"
                ? activationSqlForAll(results)
                : serializeAll(results.map((m) => m.result));
        void copyAll(text);
    }, [results, viewMode, copyAll]);

    const copyAllLabel = viewMode === "sql" ? "Copiar queries" : "Copiar todas";
    const copyAllTitle =
        viewMode === "sql"
            ? "Copiar todas las queries de activación en un solo script"
            : "Copiar todas las respuestas como un array JSON";

    return (
        <Card className="mx-auto flex h-[85vh] w-full max-w-3xl flex-col">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2">
                    UMSupport Scraper
                    <Badge variant="secondary" className="font-normal">beta</Badge>
                </CardTitle>
                <div className="flex items-center gap-2">
                    <ViewToggle value={viewMode} onChange={setViewMode} />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyAll}
                        disabled={results.length === 0}
                        aria-live="polite"
                        title={copyAllTitle}
                    >
                        {copiedAll ? <Check className="text-emerald-600" /> : <Copy />}
                        {copiedAll ? "Copiado" : copyAllLabel}
                        <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                            [{results.length}]
                        </span>
                    </Button>
                </div>
            </CardHeader>
            <Separator />
            {summary.total > 0 && (
                <>
                    <StatusTally summary={summary} />
                    <Separator />
                </>
            )}
            <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
                <div
                    ref={scrollRef}
                    className="flex-1 space-y-3 overflow-y-auto pr-2"
                >
                    {messages.map((msg, i) => (
                        <MessageBubble key={i} message={msg} viewMode={viewMode} />
                    ))}
                </div>

                <Separator />

                <div className="space-y-2">
                    <Textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={"5062990506414370,sha645627@yopmail.com\n5062990506414371\n…"}
                        rows={5}
                        disabled={isLoading}
                        className="font-mono text-sm"
                    />
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                            Cmd/Ctrl + Enter para enviar
                        </span>
                        {isLoading ? (
                            <Button variant="outline" onClick={handleCancel}>
                                Cancelar
                            </Button>
                        ) : (
                            <Button onClick={handleSubmit} disabled={!input.trim()}>
                                <Send className="h-4 w-4" />
                                Procesar
                            </Button>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

/**
 * Compact strip with a proportional bar and counts of active, inactive and
 * failed cards across the whole conversation. Updates live while streaming.
 *
 * @param summary - Output of `summarizeStatus`.
 * @returns React element with the tally strip.
 */
function StatusTally({ summary }: { summary: StatusSummary }) {
    const pct = (n: number) => `${(n / summary.total) * 100}%`;
    const cells: { key: keyof Pick<StatusSummary, "active" | "inactive" | "unknown">; label: string; dot: string }[] = [
        { key: "active", label: summary.active === 1 ? "activa" : "activas", dot: "bg-emerald-500" },
        { key: "inactive", label: summary.inactive === 1 ? "inactiva" : "inactivas", dot: "bg-amber-500" },
        { key: "unknown", label: "sin datos", dot: "bg-destructive" },
    ];
    return (
        <div className="flex items-center gap-4 px-6 py-2 text-xs" aria-live="polite">
            <div
                className="flex h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={describeStatus(summary)}
            >
                {summary.active > 0 && <span className="bg-emerald-500" style={{ width: pct(summary.active) }} />}
                {summary.inactive > 0 && <span className="bg-amber-500" style={{ width: pct(summary.inactive) }} />}
                {summary.unknown > 0 && <span className="bg-destructive" style={{ width: pct(summary.unknown) }} />}
            </div>
            <span className={cn("font-medium", summary.allActive ? "text-emerald-700 dark:text-emerald-400" : "text-foreground")}>
                {summary.allActive
                    ? summary.total === 1
                        ? "Activa"
                        : `Todas activas`
                    : summary.inactive === summary.total
                      ? "Ninguna activa"
                      : "Estado mixto"}
            </span>
            <ul className="flex items-center gap-3 text-muted-foreground">
                {cells.map((c) => (
                    <li key={c.key} className={cn("flex items-center gap-1.5", summary[c.key] === 0 && "opacity-40")}>
                        <span className={cn("size-1.5 rounded-full", c.dot)} />
                        <span className="font-mono tabular-nums text-foreground">{summary[c.key]}</span>
                        {c.label}
                    </li>
                ))}
            </ul>
        </div>
    );
}

/**
 * Two-way segmented control that switches every result bubble (and the copy
 * buttons) between the raw JSON and the generated activation SQL.
 *
 * @param value - Current view mode.
 * @param onChange - Called with the newly selected mode.
 * @returns React element with the segmented control.
 */
function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
    const options: { id: ViewMode; label: string; title: string }[] = [
        { id: "json", label: "JSON", title: "Ver la respuesta cruda del portal" },
        { id: "sql", label: "SQL", title: "Ver la query de activación con los valores sustituidos" },
    ];
    return (
        <div
            role="group"
            aria-label="Formato de las respuestas"
            className="inline-flex h-7 items-center rounded-lg border border-border bg-muted/40 p-0.5"
        >
            {options.map((opt) => {
                const active = opt.id === value;
                return (
                    <button
                        key={opt.id}
                        type="button"
                        aria-pressed={active}
                        title={opt.title}
                        onClick={() => onChange(opt.id)}
                        className={cn(
                            "h-6 rounded-md px-2 font-mono text-[0.7rem] font-medium tracking-wide transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                            active
                                ? "bg-background text-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

/**
 * Renders a chat bubble depending on the message kind (user, system, result).
 *
 * @param message - User message, system message or scrape result.
 * @param viewMode - Whether result bubbles show JSON or SQL.
 * @returns React element with the corresponding styling.
 */
function MessageBubble({ message, viewMode }: { message: ChatMessage; viewMode: ViewMode }) {
    if (message.kind === "user") {
        return (
            <div className="flex justify-end">
                <div className="flex max-w-[85%] items-start gap-2">
                    <div className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                        <pre className="whitespace-pre-wrap font-mono text-xs">{message.text}</pre>
                    </div>
                    <div className="mt-1 rounded-full bg-muted p-1">
                        <User className="h-4 w-4" />
                    </div>
                </div>
            </div>
        );
    }

    if (message.kind === "system") {
        const toneClass =
            message.tone === "error"
                ? "border-destructive/50 bg-destructive/10 text-destructive"
                : message.tone === "warning"
                  ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                  : "border-border bg-muted/40 text-muted-foreground";
        return (
            <div className={`rounded-md border px-3 py-2 text-xs ${toneClass}`}>
                {message.text}
                {message.errors && (
                    <ul className="mt-2 space-y-1 font-mono">
                        {message.errors.map((err, i) => (
                            <li key={i}>
                                <span className="opacity-70">L{err.line}:</span> {err.raw} —{" "}
                                <span className="italic">{err.reason}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        );
    }

    return <ResultBubble result={message.result} username={message.username} viewMode={viewMode} />;
}

/**
 * Renders a single scrape result with its own copy-to-clipboard control.
 * In SQL mode the body shows the activation query with substituted values
 * highlighted; missing values are flagged so the user fixes the input.
 *
 * @param result - Item emitted by the SSE endpoint.
 * @param username - Portal username typed next to the card, if any.
 * @param viewMode - Whether to show JSON or SQL.
 * @returns React element with the result bubble.
 */
function ResultBubble({
    result,
    username,
    viewMode,
}: {
    result: ScrapeItemResult;
    username?: string;
    viewMode: ViewMode;
}) {
    const isOk = result.status === "success";
    const status = cardStatus(result);
    const statusLabel = cardStatusLabel(result);
    const [copied, copy] = useCopy();
    const segments = useMemo(
        () => (isOk && viewMode === "sql" ? buildActivationSegments(result, username) : null),
        [isOk, viewMode, result, username],
    );
    const missing = segments ? hasMissingValues(segments) : false;

    const handleCopy = () => {
        const text = viewMode === "sql" ? activationSqlFor(result, username) : serializeOne(result);
        void copy(text);
    };
    const copyTitle = copied ? "Copiado" : viewMode === "sql" ? "Copiar query" : "Copiar respuesta";

    return (
        <div className="flex justify-start">
            <div
                className={cn(
                    "max-w-[85%] rounded-lg border px-3 py-2 text-sm",
                    status === "active"
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : status === "inactive"
                          ? "border-amber-500/40 bg-amber-500/5"
                          : "border-destructive/40 bg-destructive/5",
                )}
            >
                <div className="mb-1 flex items-center gap-2">
                    {status === "active" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : status === "inactive" ? (
                        <CircleSlash className="h-4 w-4 text-amber-600" />
                    ) : (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span className="font-medium">
                        #{result.index + 1} · {result.card}
                    </span>
                    {statusLabel && (
                        <Badge
                            variant="outline"
                            className={cn(
                                "h-4 px-1.5 font-mono text-[0.65rem] tracking-wide",
                                status === "active"
                                    ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                                    : "border-amber-500/50 text-amber-700 dark:text-amber-400",
                            )}
                        >
                            {statusLabel}
                        </Badge>
                    )}
                    {username && (
                        <span className="truncate font-mono text-xs text-muted-foreground">{username}</span>
                    )}
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {result.duration_ms}ms
                    </span>
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={handleCopy}
                        aria-label={copyTitle}
                        title={copyTitle}
                        className="-mr-1 text-muted-foreground hover:text-foreground"
                    >
                        {copied ? <Check className="text-emerald-600" /> : <Copy />}
                    </Button>
                </div>
                {!isOk ? (
                    <div className="text-xs">
                        <Badge variant="destructive">{result.error_code ?? "ERROR"}</Badge>{" "}
                        {result.message}
                    </div>
                ) : segments ? (
                    <>
                        <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-background/50 p-2 font-mono text-xs text-muted-foreground">
                            {segments.map((seg, i) =>
                                seg.kind === "static" ? (
                                    <span key={i}>{seg.text}</span>
                                ) : (
                                    <span
                                        key={i}
                                        title={seg.field}
                                        className={cn(
                                            "font-medium",
                                            seg.missing
                                                ? "text-destructive underline decoration-dotted underline-offset-2"
                                                : "text-foreground",
                                        )}
                                    >
                                        {seg.text}
                                    </span>
                                ),
                            )}
                        </pre>
                        {missing && (
                            <p className="mt-1.5 text-xs text-destructive">
                                Faltan valores. Añade el usuario tras la tarjeta:{" "}
                                <code className="font-mono">{result.card},usuario@dominio</code>
                            </p>
                        )}
                    </>
                ) : (
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-background/50 p-2 font-mono text-xs">
                        {JSON.stringify(result.data, null, 2)}
                    </pre>
                )}
            </div>
        </div>
    );
}

export function InlineLoader() {
    return <Loader2 className="h-4 w-4 animate-spin" />;
}
