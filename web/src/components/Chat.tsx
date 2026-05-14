import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Send, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { scrapeStream, type ScrapeItemResult } from "@/lib/api";
import { parseInput, type ParseLineError, type ScrapeItem } from "@/lib/parseInput";

type UserMessage = { kind: "user"; text: string };
type SystemMessage = {
    kind: "system";
    text: string;
    tone?: "info" | "warning" | "error";
    errors?: ParseLineError[];
};
type ResultMessage = { kind: "result"; result: ScrapeItemResult };

type ChatMessage = UserMessage | SystemMessage | ResultMessage;

/**
 * Main chat component. Owns the message list state, parses the user's pasted
 * input and streams scrape results from the backend.
 *
 * @returns React element with the chat UI (messages + textarea + button).
 */
export default function Chat() {
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            kind: "system",
            text: "Pega una lista de tarjetas (una por línea) y pulsa Procesar. El sistema buscará cada tarjeta en OneCard y mostrará el resultado en tiempo real.",
            tone: "info",
        },
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
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

        try {
            await scrapeStream(items as ScrapeItem[], (result) => {
                pushMessage({ kind: "result", result });
            }, controller.signal);

            pushMessage({
                kind: "system",
                text: "Listo. Procesamiento completado.",
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

    return (
        <Card className="mx-auto flex h-[85vh] w-full max-w-3xl flex-col">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    UMSupport Scraper
                    <Badge variant="secondary" className="font-normal">beta</Badge>
                </CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
                <div
                    ref={scrollRef}
                    className="flex-1 space-y-3 overflow-y-auto pr-2"
                >
                    {messages.map((msg, i) => (
                        <MessageBubble key={i} message={msg} />
                    ))}
                </div>

                <Separator />

                <div className="space-y-2">
                    <Textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={"5062990506414370\n5062990506414371\n…"}
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
 * Renders a chat bubble depending on the message kind (user, system, result).
 *
 * @param message - User message, system message or scrape result.
 * @returns React element with the corresponding styling.
 */
function MessageBubble({ message }: { message: ChatMessage }) {
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

    const { result } = message;
    const isOk = result.status === "success";
    return (
        <div className="flex justify-start">
            <div
                className={`max-w-[85%] rounded-lg border px-3 py-2 text-sm ${
                    isOk
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-destructive/40 bg-destructive/5"
                }`}
            >
                <div className="mb-1 flex items-center gap-2">
                    {isOk ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span className="font-medium">
                        #{result.index + 1} · {result.card}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                        {result.duration_ms}ms
                    </span>
                </div>
                {isOk ? (
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-background/50 p-2 font-mono text-xs">
                        {JSON.stringify(result.data, null, 2)}
                    </pre>
                ) : (
                    <div className="text-xs">
                        <Badge variant="destructive">{result.error_code ?? "ERROR"}</Badge>{" "}
                        {result.message}
                    </div>
                )}
            </div>
        </div>
    );
}

export function InlineLoader() {
    return <Loader2 className="h-4 w-4 animate-spin" />;
}
