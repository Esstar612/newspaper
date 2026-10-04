import type { Article } from "@/components/ArticleCard";

export const hasImage = (a: Pick<Article, "imageUrl">) => Boolean(a.imageUrl?.trim());

export function arrange<T extends Article>(articles: T[], features = 9) {
    const lead = articles.find(hasImage);
    const featured = articles.filter((a) => a !== lead && hasImage(a)).slice(0, features);
    const placed = new Set<T>([...(lead ? [lead] : []), ...featured]);
    return { lead, featured, brief: articles.filter((a) => !placed.has(a)) };
}
