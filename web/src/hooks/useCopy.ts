import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Writes text to the system clipboard. Prefers the async Clipboard API and
 * falls back to a hidden textarea + `document.execCommand("copy")` on
 * non-secure origins where `navigator.clipboard` is undefined.
 *
 * @param text - Text to place on the clipboard.
 * @returns `true` when the copy succeeded, `false` otherwise.
 */
async function writeClipboard(text: string): Promise<boolean> {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // fall through to the legacy path
        }
    }

    if (typeof document === "undefined") return false;

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    let ok = false;
    try {
        ok = document.execCommand("copy");
    } catch {
        ok = false;
    } finally {
        document.body.removeChild(textarea);
    }
    return ok;
}

/**
 * Custom hook that copies text to the clipboard and exposes a transient
 * `copied` flag so the UI can show "copied" feedback for a short time.
 *
 * @param resetMs - Milliseconds the `copied` flag stays `true` after a successful copy. Defaults to 1600.
 * @returns Tuple `[copied, copy]`: `copied` is the feedback flag and `copy(text)` resolves to `true` on success.
 */
export function useCopy(resetMs = 1600): [boolean, (text: string) => Promise<boolean>] {
    const [copied, setCopied] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    const copy = useCallback(
        async (text: string) => {
            const ok = await writeClipboard(text);
            if (!ok) return false;
            setCopied(true);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setCopied(false), resetMs);
            return true;
        },
        [resetMs],
    );

    return [copied, copy];
}
