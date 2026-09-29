import mongoose from "mongoose";
import { assertLocalMongo } from "./seed-guard";
import { makeArticle } from "../tests/fixtures/articles";

const SECTIONS: Array<[string, number]> = [
    ["world", 22],
    ["business", 30],
    ["technology", 4],
    ["science", 4],
    ["health", 4],
    ["sports", 4],
];

const label = (tag: string) => tag[0].toUpperCase() + tag.slice(1);

export function seedArticles() {
    const docs = [];
    let i = 0;
    for (const [tag, count] of SECTIONS) {
        for (let n = 1; n <= count; n++) {
            i++;
            const doc = makeArticle(i, { title: `${label(tag)} story ${String(n).padStart(2, "0")}`, tags: [tag] });
            delete doc._id;
            docs.push(doc);
        }
    }
    const world = docs.find((d) => d.tags?.[0] === "world")!;
    world.title = "World rates story";
    const business = docs.find((d) => d.tags?.[0] === "business")!;
    business.description = "Central bank holds rates steady";
    return docs;
}

export function seedCandles(symbols: string[], now = Date.now()) {
    const day = 24 * 60 * 60 * 1000;
    return symbols.map((symbol, s) => ({
        symbol,
        fetchedAt: new Date(now),
        points: Array.from({ length: 400 }, (_, d) => ({
            t: now - (399 - d) * day,
            close: 100 + s * 10 + Math.sin(d / (6 + s)) * 5,
        })),
    }));
}

export default async function globalSetup() {
    assertLocalMongo(process.env.MONGODB_URI);
    const { connectDB } = await import("@/lib/db");
    const { Article } = await import("@/models/Article");
    const { CandleSeries } = await import("@/models/CandleSeries");
    const { SYMBOLS } = await import("@/lib/stocks");

    await connectDB();
    await Article.deleteMany({});
    await CandleSeries.deleteMany({});
    await Article.insertMany(seedArticles());
    await CandleSeries.insertMany(seedCandles(SYMBOLS.map((s) => s.symbol)));
    await mongoose.disconnect();
}
