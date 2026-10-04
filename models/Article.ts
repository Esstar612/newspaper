import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const ArticleSchema = new Schema(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, default: "" },
        url: { type: String, required: true, trim: true },
        imageUrl: { type: String, default: "" },
        source: { type: String, required: true, trim: true },
        publishedAt: { type: Date, default: Date.now },
        tags: { type: [String], default: [] },
        providerId: { type: String, default: "" },
        embeddedHash: { type: String },
    },
    { timestamps: true }
);

ArticleSchema.index({ url: 1 }, { unique: true });
ArticleSchema.index({ publishedAt: -1 });
ArticleSchema.index({ createdAt: 1 });
ArticleSchema.index({ source: 1, publishedAt: -1 });
ArticleSchema.index({ tags: 1, publishedAt: -1 });

export type ArticleDoc = InferSchemaType<typeof ArticleSchema>;

// Next.js dev reloads modules; reusing the compiled model avoids OverwriteModelError.
export const Article: Model<ArticleDoc> =
    (mongoose.models.Article as Model<ArticleDoc>) ||
    mongoose.model<ArticleDoc>("Article", ArticleSchema);
