import { fileURLToPath } from "node:url";
import { Pinecone } from "@pinecone-database/pinecone";

export const INDEX_SPEC = {
    name: "newspaper-articles",
    cloud: "aws",
    region: "us-east-1",
    embed: { model: "llama-text-embed-v2", fieldMap: { text: "text" }, metric: "cosine" },
};

export async function createIndex(pc, { waitUntilReady = true } = {}) {
    const index = await pc.indexes.createForModel({ ...INDEX_SPEC, waitUntilReady, timeout: 300_000 });
    return index.host;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
        console.error("Set PINECONE_API_KEY in .env.local and run with node --env-file=.env.local.");
        process.exit(1);
    }
    const host = await createIndex(new Pinecone({ apiKey }));
    console.log(`Index ${INDEX_SPEC.name} is ready. Add this to .env.local and Vercel Production:`);
    console.log(`PINECONE_INDEX_HOST=${host}`);
}
