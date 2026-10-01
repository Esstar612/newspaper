import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const AskUsageSchema = new Schema({
    key: { type: String, required: true },
    n: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
});

AskUsageSchema.index({ key: 1 }, { unique: true });
AskUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AskUsageDoc = InferSchemaType<typeof AskUsageSchema>;

export const AskUsage: Model<AskUsageDoc> =
    (mongoose.models.AskUsage as Model<AskUsageDoc>) || mongoose.model<AskUsageDoc>("AskUsage", AskUsageSchema);
