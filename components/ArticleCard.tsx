// components/ArticleCard.tsx
import { LABELS } from "@/lib/categories";
import { relativeTime, truncate } from "@/lib/format";
import { ArticleThumb } from "@/components/ArticleThumb";
import { cn } from "@/components/ui";

export type Article = {
    _id?: string;
    title: string;
    description?: string;
    url: string;
    imageUrl?: string;
    source: string;
    publishedAt?: string;
    tags?: string[];
};

/**
 * Three weights, so a page of 20 stories reads as a front page rather than a wall
 * of identical tiles:
 *   lead     - one story, large image, display headline
 *   feature  - the next couple, standard card
 *   compact  - the tail, text-first with a thumbnail
 */
type Variant = "lead" | "feature" | "compact";

function Meta({ article, className }: { article: Article; className?: string }) {
    const tag = article.tags?.[0];
    const when = relativeTime(article.publishedAt);
    return (
        <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs uppercase", className)}>
            <span className="font-semibold text-accent">{article.source}</span>
            {/* `tags?.length &&` renders a literal 0 when tags is empty. */}
            {tag ? <span className="text-ink-subtle">· {LABELS[tag] ?? tag}</span> : null}
            {when ? <span className="normal-case tracking-normal text-ink-subtle">· {when}</span> : null}
        </div>
    );
}

export function ArticleCard({
    article,
    variant = "feature",
}: {
    article: Article;
    variant?: Variant;
}) {
    /*
     * The whole card is the click target via a stretched pseudo-element on the
     * headline link. The old card set `cursor: pointer` on the container but only
     * a small "Read article" link was actually activatable — a false affordance.
     * This keeps exactly one link in the tab order.
     */
    const headline = (
        <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="after:absolute after:inset-0 after:content-['']"
        >
            {article.title}
        </a>
    );

    if (variant === "compact") {
        /*
         * Text-only, for the "In brief" columns. Dropping the thumbnail is what makes
         * this read as a deliberate second register rather than as cards that ran out
         * of images — a long single-column list of stubby cards looked like the design
         * had simply given up partway down the page.
         */
        return (
            <article className="group relative border-t border-line py-3.5">
                <Meta article={article} className="mb-1.5" />
                <h3 className="font-serif text-lg font-semibold leading-snug text-ink transition-colors group-hover:text-accent">
                    {headline}
                </h3>
            </article>
        );
    }

    if (variant === "lead") {
        return (
            <article className="group relative grid gap-5 overflow-hidden rounded-lg border border-line bg-surface md:grid-cols-2">
                {/*
                  * Fixed aspect at every breakpoint. `md:h-full` resolved against an
                  * auto-height grid row, so it fell back to the image's intrinsic
                  * height and the lead rendered ~620px tall.
                  */}
                <ArticleThumb
                    src={article.imageUrl}
                    className="aspect-[16/10]"
                    sizes="(max-width: 768px) 100vw, 50vw"
                />
                <div className="flex flex-col justify-center p-5 md:p-8">
                    <Meta article={article} className="mb-3" />
                    <h2 className="font-serif text-3xl font-semibold leading-tight text-ink transition-colors group-hover:text-accent md:text-4xl">
                        {headline}
                    </h2>
                    {article.description && (
                        <p className="mt-3 text-lg leading-relaxed text-ink-muted">
                            {truncate(article.description, 220)}
                        </p>
                    )}
                </div>
            </article>
        );
    }

    return (
        <article className="group relative flex flex-col overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-line-strong">
            <ArticleThumb
                src={article.imageUrl}
                className="aspect-[16/9]"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
            <div className="flex flex-1 flex-col p-4">
                <Meta article={article} className="mb-2" />
                <h3 className="font-serif text-xl font-semibold leading-snug text-ink transition-colors group-hover:text-accent">
                    {headline}
                </h3>
                {article.description && (
                    <p className="mt-2 line-clamp-3 text-base leading-relaxed text-ink-muted">
                        {truncate(article.description, 160)}
                    </p>
                )}
            </div>
        </article>
    );
}
