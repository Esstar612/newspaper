import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../msw";
import { QUERY_SHAPE, loadMonitors, syncMonitors } from "@/scripts/datadog-monitors.mjs";

const BASE = "https://api.datadoghq.com/api/v1/monitor";
const FILE = new URL("../../datadog/monitors.json", import.meta.url);
const raw = JSON.parse(readFileSync(FILE, "utf8")) as Array<{ name: string; query: string; message: string }>;

type Call = { method: string; url: URL; auth: string | null; body?: Record<string, unknown> };
let calls: Call[] = [];
let existing: Array<{ id: number; name: string }> = [];
const logs: string[] = [];

beforeEach(() => {
    calls = [];
    existing = [];
    logs.length = 0;
    const record = async (request: Request) => {
        calls.push({
            method: request.method,
            url: new URL(request.url),
            auth: request.headers.get("Authorization"),
            body: request.method === "GET" ? undefined : await request.json(),
        });
    };
    server.use(
        http.get(BASE, async ({ request }) => {
            await record(request);
            const name = new URL(request.url).searchParams.get("name") ?? "";
            return HttpResponse.json(existing.filter((m) => m.name.includes(name)));
        }),
        http.post(BASE, async ({ request }) => {
            await record(request);
            return HttpResponse.json({ id: 900 + calls.length });
        }),
        http.put(`${BASE}/:id`, async ({ request, params }) => {
            await record(request);
            return HttpResponse.json({ id: Number(params.id) });
        })
    );
});

const sync = (monitors = loadMonitors(FILE)) =>
    syncMonitors(monitors, { site: "datadoghq.com", token: "test-token", log: (line: string) => logs.push(line) });

describe("monitor definitions", () => {
    it("defines five monitors with unique names", () => {
        expect(raw).toHaveLength(5);
        expect(new Set(raw.map((m) => m.name)).size).toBe(5);
    });

    it.each(raw.map((m) => [m.name, m.query]))("%s has a well-formed query", (_, query) => {
        expect(query).toMatch(QUERY_SHAPE);
    });

    it("only the ingest message mentions force=1", () => {
        expect(raw.filter((m) => m.message.includes("force=1")).map((m) => m.name)).toEqual([
            "[newspaper] ingest-news did not run",
        ]);
    });

    it("appends the notification handle to every message", () => {
        const monitors = loadMonitors(FILE, "@me@example.com");
        expect(monitors.every((m: { message: string }) => m.message.endsWith(" @me@example.com"))).toBe(true);
    });
});

describe("syncMonitors", () => {
    it("creates every monitor when none exist, with the bearer token", async () => {
        await sync();
        const writes = calls.filter((c) => c.method !== "GET");
        expect(writes.map((c) => c.method)).toEqual(["POST", "POST", "POST", "POST", "POST"]);
        expect(calls.every((c) => c.auth === "Bearer test-token")).toBe(true);
        expect(writes[0].body).toMatchObject({ name: raw[0].name, type: "query alert", query: raw[0].query });
        expect(logs[0]).toMatch(/^created \d+ \[newspaper\] ingest-news did not run$/);
    });

    it("updates by id when the exact name exists, without sending the type", async () => {
        existing = [{ id: 42, name: "[newspaper] a cron job failed" }];
        await sync();
        const put = calls.find((c) => c.method === "PUT")!;
        expect(put.url.pathname).toBe("/api/v1/monitor/42");
        expect(put.body).toMatchObject({ name: "[newspaper] a cron job failed" });
        expect(put.body).not.toHaveProperty("type");
        expect(calls.filter((c) => c.method === "POST")).toHaveLength(4);
    });

    it("does not update a monitor whose name only contains the target name", async () => {
        existing = [{ id: 7, name: "[newspaper] ingest-news did not run (old)" }];
        await sync();
        expect(calls.some((c) => c.method === "PUT")).toBe(false);
        expect(calls.filter((c) => c.method === "POST")).toHaveLength(5);
    });

    it("stops with the status and body when Datadog rejects a write", async () => {
        server.use(http.post(BASE, () => HttpResponse.json({ errors: ["Forbidden"] }, { status: 403 })));
        await expect(sync()).rejects.toThrow(/403.*Forbidden/);
    });
});
