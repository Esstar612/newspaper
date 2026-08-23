// app/page.tsx
//
// The front page. This replaces a generic SaaS landing page (hero + three feature
// cards + a "Features" checklist) whose copy had also gone stale — it advertised
// "NYT, NewsAPI and more" when NewsAPI is dev-only in production and BBC is now a
// primary source, and named Recharts, an internal library, to end users.
//
// Server Component: reads Mongo directly and shares the cached bulk quote fetch,
// so the front page ships no client JS of its own.
import Link from "next/link";
import { connectDB } from "@/lib/db";
import { Article as ArticleModel } from "@/models/Article";
import { ArticleCard, type Article } from "@/components/ArticleCard";
import { Icon } from "@/components/ui";
import { MarketsStrip } from "@/components/MarketsStrip";

export const dynamic = "force-dynamic";

async function getArticles(): Promise<Article[]> {
    try {
        await connectDB();
        const docs = await ArticleModel.find({})
            .sort({ publishedAt: -1, _id: -1 })
            .limit(22)
            .select({ title: 1, description: 1, url: 1, imageUrl: 1, source: 1, publishedAt: 1, tags: 1 })
            .lean();

        return docs.map((d) => ({
            _id: String(d._id),
            title: d.title,
            description: d.description ?? "",
            url: d.url,
            imageUrl: d.imageUrl ?? "",
            source: d.source,
            publishedAt: d.publishedAt ? new Date(d.publishedAt).toISOString() : undefined,
            tags: d.tags ?? [],
        }));
    } catch {
        return [];
    }
}

export default async function HomePage() {
    // Market data is fetched client-side by <MarketsStrip>, so the front page
    // renders news without waiting on a third party.
    const articles = await getArticles();

    const [lead, ...rest] = articles;
    const featured = rest.slice(0, 9);
    const more = rest.slice(9);

    return (
        <div className="min-h-screen">
            <div className="mx-auto max-w-page px-4 py-8 sm:px-6">
                {/* Masthead */}
                <header className="mb-5 border-b-2 border-line-strong pb-5 text-center">
                    <h1 className="font-serif text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
                        The Newspaper
                    </h1>
                    <p className="mt-2 text-base text-ink-muted">
                        {new Date().toLocaleDateString(undefined, {
                            weekday: "long",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                        })}
                    </p>
                </header>

                <MarketsStrip />

                {articles.length === 0 ? (
                    <p className="py-20 text-center text-lg text-ink-muted">
                        Today&rsquo;s edition is still being typeset. Check back shortly.
                    </p>
                ) : (
                    <div className="mt-8 space-y-10">
                        {lead && <ArticleCard article={lead} variant="lead" />}

                        {featured.length > 0 && (
                            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                                {featured.map((a) => (
                                    <ArticleCard key={a._id ?? a.url} article={a} variant="feature" />
                                ))}
                            </div>
                        )}

                        {more.length > 0 && (
                            <section aria-label="In brief">
                                <h2 className="mb-1 border-b-2 border-line-strong pb-2 font-serif text-2xl font-semibold text-ink">
                                    In brief
                                </h2>
                                <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
                                    {more.map((a) => (
                                        <ArticleCard key={a._id ?? a.url} article={a} variant="compact" />
                                    ))}
                                </div>
                            </section>
                        )}

                        <div className="flex justify-center border-t border-line pt-8">
                            <Link
                                href="/news"
                                className="inline-flex items-center gap-2 rounded bg-accent-strong px-5 py-2.5 text-base font-semibold text-accent-ink no-underline transition-[filter] hover:brightness-110"
                            >
                                Browse all sections
                                <Icon name="chevronRight" size={16} />
                            </Link>
                        </div>
                    </div>
                )}
            </div>

            <footer className="border-t border-line py-6 text-center text-sm text-ink-subtle">
                Reporting from the New York Times and the BBC · {new Date().getFullYear()}
            </footer>
        </div>
    );
}
