// @vitest-environment jsdom
import "../setup.dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "@/components/ThemeToggle";

beforeEach(() => {
    vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    );
    document.documentElement.classList.remove("light");
});

afterEach(() => vi.unstubAllGlobals());

describe("ThemeToggle", () => {
    it("switches to light, stores the choice, and switches back", async () => {
        const user = userEvent.setup();
        render(<ThemeToggle />);

        await user.click(screen.getByRole("button", { name: "Switch to light theme" }));
        expect(document.documentElement).toHaveClass("light");
        expect(localStorage.getItem("theme")).toBe("light");

        await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));
        expect(document.documentElement).not.toHaveClass("light");
        expect(localStorage.getItem("theme")).toBe("dark");
    });
});
