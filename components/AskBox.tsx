"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { GENERAL, LABELS } from "@/lib/categories";
import { WHEN, isWhen, type When } from "@/lib/when";
import { relativeTime, utf8Bytes } from "@/lib/format";
import type { Article } from "@/components/ArticleCard";
import { ArticleThumb } from "@/components/ArticleThumb";
import { Icon, cn } from "@/components/ui";

type Props = {
    category: string;
    when: When;
    onWhenChange: (when: When) => void;
    onSubmit: (query: string) => void;
    debounceMs?: number;
};

const typingInField = (target: EventTarget | null) =>
    target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export function AskBox({ category, when, onWhenChange, onSubmit, debounceMs = 250 }: Props) {
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const [found, setFound] = useState<{ query: string; articles: Article[] }>({ query: "", articles: [] });
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const inflight = useRef<AbortController | null>(null);
    const input = useRef<HTMLInputElement>(null);
    const links = useRef<Array<HTMLAnchorElement | null>>([]);
    const id = useId();
    const listId = `${id}-list`;
    const optionId = (i: number) => `${id}-option-${i}`;

    const trimmed = query.trim();
    const tooLong = utf8Bytes(trimmed) > 300;
    const expanded = open && trimmed.length > 0;
    const matches = found.query === trimmed ? found.articles : [];

    const cancelMatches = useCallback(() => {
        clearTimeout(timer.current);
        inflight.current?.abort();
        inflight.current = null;
    }, []);

    useEffect(() => {
        cancelMatches();
        if (!trimmed) return;
        timer.current = setTimeout(() => {
            const controller = new AbortController();
            inflight.current = controller;
            const url = new URL("/api/news", window.location.origin);
            url.searchParams.set("q", trimmed);
            url.searchParams.set("limit", "5");
            if (category !== GENERAL) url.searchParams.set("category", category);
            if (when !== "any") url.searchParams.set("when", when);
            fetch(url, { signal: controller.signal })
                .then((res) => (res.ok ? res.json() : { articles: [] }))
                .then((data) => {
                    if (inflight.current !== controller) return;
                    setFound({ query: trimmed, articles: data.articles ?? [] });
                    setActive(0);
                })
                .catch(() => undefined);
        }, debounceMs);
        return cancelMatches;
    }, [trimmed, category, when, debounceMs, cancelMatches]);

    useEffect(() => {
        const focusOnSlash = (e: globalThis.KeyboardEvent) => {
            if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || typingInField(e.target)) return;
            e.preventDefault();
            input.current?.focus();
        };
        document.addEventListener("keydown", focusOnSlash);
        return () => document.removeEventListener("keydown", focusOnSlash);
    }, []);

    const submit = (e?: FormEvent) => {
        e?.preventDefault();
        if (!trimmed || tooLong) return;
        cancelMatches();
        setOpen(false);
        onSubmit(trimmed);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        const count = matches.length + 1;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + count) % count);
        } else if (e.key === "Escape") {
            setOpen(false);
        } else if (e.key === "Enter" && expanded && active > 0) {
            e.preventDefault();
            links.current[active - 1]?.click();
        }
    };

    return (
        <form role="search" onSubmit={submit} className="relative w-full lg:w-[560px] lg:shrink-0">
            <div className="flex min-h-14 flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-line-strong bg-surface py-1.5 pl-4 pr-1.5 focus-within:border-accent">
                <Icon name="ask" size={20} className="shrink-0 text-accent" />
                <label htmlFor={`${id}-input`} className="sr-only">
                    Search headlines or ask a question
                </label>
                <input
                    ref={input}
                    id={`${id}-input`}
                    type="text"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={expanded}
                    aria-controls={listId}
                    aria-activedescendant={expanded ? optionId(active) : undefined}
                    autoComplete="off"
                    value={query}
                    placeholder="Search headlines or ask a question"
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                        setActive(0);
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setOpen(false)}
                    onKeyDown={handleKeyDown}
                    className="h-11 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-subtle"
                />
                <span className="hidden whitespace-nowrap rounded-full bg-raised px-2.5 py-1 text-xs font-medium text-ink-muted sm:inline">
                    in {LABELS[category] ?? category}
                </span>
                <label htmlFor={`${id}-when`} className="sr-only">
                    When
                </label>
                <select
                    id={`${id}-when`}
                    value={when}
                    onChange={(e) => isWhen(e.target.value) && onWhenChange(e.target.value)}
                    className="order-last mb-1 w-full cursor-pointer rounded-full bg-raised px-2.5 py-1 text-xs font-medium text-ink-muted sm:order-none sm:mb-0 sm:w-auto"
                >
                    {Object.entries(WHEN).map(([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ))}
                </select>
                {!query && (
                    <kbd className="hidden h-6 items-center rounded border border-line-strong px-2 text-xs text-ink-muted sm:flex">/</kbd>
                )}
                <button
                    type="submit"
                    className="h-11 shrink-0 rounded-lg bg-accent-strong px-5 font-semibold text-accent-ink hover:opacity-90"
                >
                    Ask
                </button>
            </div>
            {tooLong && <p className="mt-2 text-sm text-ink-muted">That question is too long. Please shorten it.</p>}

            {expanded && (
                <div
                    onMouseDown={(e) => e.preventDefault()}
                    className="absolute inset-x-0 top-full z-20 mt-2 rounded-xl border border-line bg-surface p-2 shadow-2xl"
                >
                    <ul id={listId} role="listbox" aria-label="Suggestions" className="flex flex-col gap-1">
                        <li
                            id={optionId(0)}
                            role="option"
                            aria-selected={active === 0}
                            onClick={() => submit()}
                            className={cn("flex cursor-pointer items-center gap-3 rounded-lg p-3", active === 0 && "bg-raised")}
                        >
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="truncate font-semibold text-ink">Ask: “{trimmed}”</span>
                                <span className="text-sm text-ink-muted">Get a summary answer, with the articles it came from</span>
                            </span>
                            <kbd className="flex h-6 items-center rounded border border-line-strong px-2 text-xs text-ink-muted">Enter</kbd>
                        </li>
                        {matches.length > 0 && (
                            <li role="presentation" className="px-3 pb-0.5 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                                Or jump straight to an article
                            </li>
                        )}
                        {matches.map((article, i) => (
                            <li key={article._id ?? article.url} role="presentation">
                                <a
                                    ref={(el) => {
                                        links.current[i] = el;
                                    }}
                                    id={optionId(i + 1)}
                                    role="option"
                                    aria-selected={active === i + 1}
                                    href={article.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5", active === i + 1 && "bg-raised")}
                                >
                                    <ArticleThumb src={article.imageUrl} className="h-8 w-11 shrink-0 rounded" />
                                    <span className="flex min-w-0 flex-col gap-0.5">
                                        <span className="font-serif font-semibold leading-snug text-ink">{article.title}</span>
                                        <span className="text-xs text-ink-subtle">
                                            {[article.source, relativeTime(article.publishedAt)].filter(Boolean).join(" · ")}
                                        </span>
                                    </span>
                                </a>
                            </li>
                        ))}
                    </ul>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-3 pb-1 pt-2.5 text-xs text-ink-subtle">
                        <span>↑ ↓ to move</span>
                        <span>Enter to ask</span>
                        <span>Esc to close</span>
                        <span className="ml-auto text-ink-muted">Enter also shows related stories</span>
                    </div>
                </div>
            )}
        </form>
    );
}
