import { describe, expect, it } from "vitest";
import { arrange, hasImage } from "@/lib/arrange";
import { makeArticle, makeArticles } from "../fixtures/articles";

const plain = (i: number) => makeArticle(i, { imageUrl: "" });
const titles = (list: Array<{ title: string }>) => list.map((a) => a.title);

describe("arrange", () => {
    it("leads with the newest story that has a picture, even when newer ones have none", () => {
        const list = [plain(1), plain(2), ...makeArticles(12).slice(2)];
        const { lead, featured, brief } = arrange(list);
        expect(lead?.title).toBe("Story 03");
        expect(titles(featured)).toEqual(["Story 04", "Story 05", "Story 06", "Story 07", "Story 08", "Story 09", "Story 10", "Story 11", "Story 12"]);
        expect(titles(brief)).toEqual(["Story 01", "Story 02"]);
    });

    it("keeps stories without pictures in their original order among the brief", () => {
        const list = [...makeArticles(10), plain(11), makeArticle(12), plain(13), makeArticle(14)];
        const { brief } = arrange(list);
        expect(titles(brief)).toEqual(["Story 11", "Story 12", "Story 13", "Story 14"]);
    });

    it("leaves no lead and puts everything in the brief when nothing has a picture", () => {
        const list = [plain(1), plain(2)];
        expect(arrange(list)).toEqual({ lead: undefined, featured: [], brief: list });
    });

    it("counts a blank image address as no picture", () => {
        expect(hasImage({ imageUrl: "  " })).toBe(false);
        expect(hasImage({ imageUrl: undefined })).toBe(false);
        expect(hasImage(makeArticle(1))).toBe(true);
    });

    it("lets a later page's picture fill an under-filled grid, but not a full one", () => {
        const full = [...makeArticles(10), plain(11), makeArticle(12)];
        expect(titles(arrange(full).featured)).not.toContain("Story 12");
        const short = [...makeArticles(9), plain(10), plain(11), makeArticle(12)];
        expect(titles(arrange(short).featured).at(-1)).toBe("Story 12");
    });
});
