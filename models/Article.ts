// models/Article.ts
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const ArticleSchema = new Schema(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, default: "" },
        url: { type: String, required: true, trim: true },
        imageUrl: { type: String, default: "" },

        // where it came from (nyt, newsapi, newsdataio, etc.)
        source: { type: String, required: true, trim: true },

        // provider may publish a timestamp; if missing we still store it
        publishedAt: { type: Date, default: Date.now },

        // optional: useful for filtering (e.g. "business", "markets", "tech")
        tags: { type: [String], default: [] },

        // optional: helps you trace duplicates or provider IDs later
        providerId: { type: String, default: "" },
    },
    {
        timestamps: true, // adds createdAt + updatedAt automatically
    }
);

/**
 * V2 "professional" improvements:
 * - dedupe by URL (the same article may appear across multiple sources)
 * - fast feed sorting by publishedAt
 * - optional filtering by source
 */
ArticleSchema.index({ url: 1 }, { unique: true });
ArticleSchema.index({ publishedAt: -1 });
ArticleSchema.index({ source: 1, publishedAt: -1 });

// Category tabs filter on tags; without this the query is a full collection scan.
ArticleSchema.index({ tags: 1, publishedAt: -1 });

// Types
export type ArticleDoc = InferSchemaType<typeof ArticleSchema>;

// Prevent model recompile errors in Next.js dev
export const Article: Model<ArticleDoc> =
    (mongoose.models.Article as Model<ArticleDoc>) ||
    mongoose.model<ArticleDoc>("Article", ArticleSchema);
