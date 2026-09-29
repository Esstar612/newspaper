import { describe, expect, it } from "vitest";
import { assertLocalMongo } from "@/e2e/seed-guard";

describe("assertLocalMongo", () => {
    it.each(["mongodb://127.0.0.1:27017", "mongodb://localhost:27017", "mongodb://[::1]:27017"])(
        "accepts %s",
        (uri) => {
            expect(assertLocalMongo(uri)).toBe(uri);
        }
    );

    it.each([
        "mongodb+srv://user:pass@cluster0.x.mongodb.net",
        "mongodb://10.0.0.5:27017",
        "mongodb://db.example.com:27017",
        "not a uri",
        "",
        undefined,
    ])("refuses %s", (uri) => {
        expect(() => assertLocalMongo(uri)).toThrow(/Refusing to seed/);
    });
});
