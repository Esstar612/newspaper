import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
    connectDB: vi.fn(),
    filters: [] as unknown[],
    docs: [] as unknown[],
}));

vi.mock("@/lib/db", () => ({ connectDB: db.connectDB }));
vi.mock("@/models/Article", () => ({
    Article: {
        find: (filter: unknown) => {
            db.filters.push(filter);
            const link: Record<string, unknown> = {};
            for (const m of ["sort", "limit", "select"]) link[m] = () => link;
            link.lean = () => Promise.resolve(db.docs);
            return link;
        },
    },
}));

const { GET } = await import("@/app/api/news/route");

const get = async (query: string) => {
    const res = await GET(new Request(`http://localhost/api/news?${query}`));
    return { status: res.status, body: await res.json() };
};

const conditions = () => ((db.filters.at(-1) as { $and?: unknown[] }).$and ?? []) as Array<Record<string, unknown>>;

beforeEach(() => {
    db.connectDB.mockReset().mockResolvedValue(undefined);
    db.filters = [];
    db.docs = [];
});

afterEach(() => vi.useRealTimers());

describe("/api/news", () => {
    it("asks for everything when there is nothing to filter", async () => {
        const { status } = await get("");
        expect(status).toBe(200);
        expect(db.filters).toEqual([{}]);
    });

    it("filters by section and by a case-insensitive phrase", async () => {
        await get("category=business&q=rates");
        expect(conditions()).toEqual([
            { tags: "business" },
            { $or: [{ title: { $regex: "rates", $options: "i" } }, { description: { $regex: "rates", $options: "i" } }] },
        ]);
    });

    it("adds a publication-date window, counted back from the server's clock", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
        await get("category=business&q=rates&when=month");
        expect(conditions()).toContainEqual({ tags: "business" });
        expect(conditions()).toContainEqual({ publishedAt: { $gte: new Date("2026-09-04T12:00:00Z") } });
    });

    it.each(["any", "fortnight", "toString"])("adds no date condition for %s", async (when) => {
        await get(`q=rates&when=${when}`);
        expect(conditions().some((c) => "publishedAt" in c)).toBe(false);
    });
});
