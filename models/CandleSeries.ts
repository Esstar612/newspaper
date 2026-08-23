// models/CandleSeries.ts
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * One document per symbol, holding roughly a year of daily closes.
 *
 * History lives here rather than being fetched per request because marketdata.app
 * allows one active IP per account and explicitly does not support serverless.
 * Fetching per request meant 10 symbols x 4 ranges = 40 separate upstream calls
 * from rotating Vercel IPs, which tripped its block constantly. A daily cron
 * writes this collection instead, and the chart reads only from here.
 *
 * ~250 trading days per symbol, two numbers each — nowhere near Mongo's document
 * size limit, and one stored year serves every range the UI offers.
 */
const CandlePointSchema = new Schema(
    {
        // epoch milliseconds, matching what the chart expects
        t: { type: Number, required: true },
        close: { type: Number, required: true },
    },
    { _id: false } // these are plain values; per-point ObjectIds would triple the size
);

const CandleSeriesSchema = new Schema(
    {
        symbol: { type: String, required: true, trim: true, uppercase: true },

        // ascending by time, so range slicing is a tail of the array
        points: { type: [CandlePointSchema], default: [] },

        // when the provider was last successfully read, surfaced to the reader as "as of"
        fetchedAt: { type: Date, default: Date.now },
    },
    {
        timestamps: true, // adds createdAt + updatedAt automatically
    }
);

// The cron upserts by symbol, and the chart reads by symbol; one document each.
CandleSeriesSchema.index({ symbol: 1 }, { unique: true });

// Types
export type CandleSeriesDoc = InferSchemaType<typeof CandleSeriesSchema>;

// Prevent model recompile errors in Next.js dev
export const CandleSeries: Model<CandleSeriesDoc> =
    (mongoose.models.CandleSeries as Model<CandleSeriesDoc>) ||
    mongoose.model<CandleSeriesDoc>("CandleSeries", CandleSeriesSchema);
