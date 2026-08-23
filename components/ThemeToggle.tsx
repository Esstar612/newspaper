"use client";

import { useSyncExternalStore } from "react";
import { Icon, cn } from "@/components/ui";

export type Theme = "light" | "dark";

/**
 * Runs before first paint, inlined in <head>, so the correct theme is on <html>
 * before anything renders. Without it the page paints dark and then snaps to light.
 *
 * Kept as a string because it must be a synchronous, blocking <script>.
 */
export const THEME_INIT_SCRIPT = `
(function(){
  try {
    var stored = localStorage.getItem("theme");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    if (theme === "light") document.documentElement.classList.add("light");
  } catch (e) {}
})();
`.trim();

/*
 * The class on <html> is the single source of truth — it is set by the script above
 * before React exists, so component state would only ever be a second, staler copy.
 * useSyncExternalStore reads the DOM directly and gives React a correct server
 * snapshot, which avoids both a hydration mismatch and a setState-in-effect.
 */
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(onChange: () => void) {
    listeners.add(onChange);

    // Follow the OS only while the user has made no explicit choice.
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onSystemChange = (e: MediaQueryListEvent) => {
        try {
            if (localStorage.getItem("theme")) return;
        } catch {
            // Storage unavailable — treat as "no explicit choice".
        }
        document.documentElement.classList.toggle("light", e.matches);
        emit();
    };
    mq.addEventListener("change", onSystemChange);

    return () => {
        listeners.delete(onChange);
        mq.removeEventListener("change", onSystemChange);
    };
}

const getSnapshot = (): Theme =>
    document.documentElement.classList.contains("light") ? "light" : "dark";

// The server cannot know the visitor's theme; the script corrects it before paint.
const getServerSnapshot = (): Theme => "dark";

export function ThemeToggle() {
    const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const next: Theme = theme === "light" ? "dark" : "light";

    const toggle = () => {
        document.documentElement.classList.toggle("light", next === "light");
        try {
            localStorage.setItem("theme", next);
        } catch {
            // Private mode / storage disabled — the toggle still works for this page.
        }
        emit();
    };

    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={`Switch to ${next} theme`}
            title={`Switch to ${next} theme`}
            className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded text-ink-muted",
                "transition-colors hover:bg-raised hover:text-ink"
            )}
        >
            <Icon name={theme === "light" ? "moon" : "sun"} size={18} />
        </button>
    );
}
