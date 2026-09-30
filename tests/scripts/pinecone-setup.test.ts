import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { Pinecone } from "@pinecone-database/pinecone";
import { server } from "../msw";
import { INDEX_SPEC, createIndex } from "@/scripts/pinecone-setup.mjs";

describe("pinecone setup", () => {
    it("describes a llama-text-embed-v2 index in us-east-1", () => {
        expect(INDEX_SPEC).toMatchObject({
            name: "newspaper-articles",
            cloud: "aws",
            region: "us-east-1",
            embed: { model: "llama-text-embed-v2", fieldMap: { text: "text" }, metric: "cosine" },
        });
    });

    it("posts the spec to the control plane and returns the host", async () => {
        let body: Record<string, unknown> | undefined;
        server.use(
            http.post("https://api.pinecone.io/indexes/create-for-model", async ({ request }) => {
                body = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json(
                    {
                        name: "newspaper-articles",
                        dimension: 1024,
                        metric: "cosine",
                        host: "newspaper-articles-abc123.svc.aped-4627-b74a.pinecone.io",
                        spec: { serverless: { cloud: "aws", region: "us-east-1" } },
                        status: { ready: true, state: "Ready" },
                        vector_type: "dense",
                        deletion_protection: "disabled",
                        embed: { model: "llama-text-embed-v2", field_map: { text: "text" }, metric: "cosine", dimension: 1024 },
                    },
                    { status: 201 }
                );
            })
        );
        const host = await createIndex(new Pinecone({ apiKey: "test-key" }), { waitUntilReady: false });
        expect(host).toBe("newspaper-articles-abc123.svc.aped-4627-b74a.pinecone.io");
        expect(body).toMatchObject({
            name: "newspaper-articles",
            cloud: "aws",
            region: "us-east-1",
            embed: { model: "llama-text-embed-v2", field_map: { text: "text" }, metric: "cosine" },
        });
    });
});
