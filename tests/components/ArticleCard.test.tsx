// @vitest-environment jsdom
import "../setup.dom";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ArticleCard } from "@/components/ArticleCard";
import { PLACEHOLDER_IMAGE } from "@/lib/format";
import { makeArticle } from "../fixtures/articles";

const article = makeArticle(1, { imageUrl: "https://example.com/story-01.jpg" });

describe("ArticleCard", () => {
    it.each(["lead", "feature", "compact"] as const)("%s links the headline to the article", (variant) => {
        render(<ArticleCard article={article} variant={variant} />);
        const link = screen.getByRole("link", { name: article.title });
        expect(link).toHaveAttribute("href", article.url);
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener noreferrer");
        expect(screen.getByText(article.source)).toBeInTheDocument();
    });

    it.each(["lead", "feature"] as const)("%s shows the description", (variant) => {
        render(<ArticleCard article={article} variant={variant} />);
        expect(screen.getByText(article.description!)).toBeInTheDocument();
    });

    it("compact leaves out the description and the image", () => {
        const { container } = render(<ArticleCard article={article} variant="compact" />);
        expect(screen.queryByText(article.description!)).not.toBeInTheDocument();
        expect(container.querySelector("img")).toBeNull();
    });

    it("renders a feature card without a picture as text only", () => {
        const plain = makeArticle(2, { imageUrl: "" });
        const { container } = render(<ArticleCard article={plain} variant="feature" />);
        expect(container.querySelector("img")).toBeNull();
        expect(screen.getByRole("link", { name: plain.title })).toHaveAttribute("href", plain.url);
        expect(screen.getByText(plain.source)).toBeInTheDocument();
        expect(screen.getByText(plain.description!)).toBeInTheDocument();
    });

    it("treats a blank image address as no picture", () => {
        const { container } = render(<ArticleCard article={makeArticle(2, { imageUrl: "   " })} variant="feature" />);
        expect(container.querySelector("img")).toBeNull();
    });

    it("swaps a broken image for the placeholder", () => {
        const { container } = render(<ArticleCard article={article} />);
        const img = container.querySelector("img")!;
        expect(img).toHaveAttribute("src", article.imageUrl);
        fireEvent.error(img);
        expect(img).toHaveAttribute("src", PLACEHOLDER_IMAGE);
    });
});
