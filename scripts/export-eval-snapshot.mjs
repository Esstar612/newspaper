import { writeFileSync } from "node:fs";
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
if (!uri) {
    console.error("Run with node --env-file=.env.local so MONGODB_URI is set.");
    process.exit(1);
}

await mongoose.connect(uri, { dbName: "newspaper" });
const docs = await mongoose.connection.db
    .collection("articles")
    .find({}, { projection: { title: 1, description: 1, url: 1, source: 1, tags: 1, publishedAt: 1 } })
    .sort({ publishedAt: -1 })
    .toArray();
await mongoose.disconnect();

const articles = docs.map((d) => ({
    _id: String(d._id),
    title: d.title,
    description: d.description ?? "",
    url: d.url,
    source: d.source,
    tags: d.tags ?? [],
    publishedAt: d.publishedAt ? new Date(d.publishedAt).toISOString() : null,
}));

const out = new URL("../eval/snapshot.local.json", import.meta.url);
writeFileSync(out, JSON.stringify({ exportedAt: new Date().toISOString(), count: articles.length, articles }, null, 1));
console.log(`Wrote ${articles.length} articles to eval/snapshot.local.json`);
