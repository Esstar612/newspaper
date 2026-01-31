// lib/db.ts
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    throw new Error("Missing environment variable: MONGODB_URI");
}
const uri: string = MONGODB_URI;

/**
 * Next.js hot reloads can cause multiple connections in dev.
 * We cache the connection globally to avoid opening too many.
 */
declare global {
    // eslint-disable-next-line no-var
    var mongooseConnection: {
        conn: typeof mongoose | null;
        promise: Promise<typeof mongoose> | null;
    } | undefined;
}

const cached =
    global.mongooseConnection ??
    (global.mongooseConnection = { conn: null, promise: null });

export async function connectDB() {
    if (cached.conn) {
        return cached.conn;
    }

    if (!cached.promise) {
        cached.promise = mongoose
            .connect(uri, {
                dbName: "newspaper",
            })
            .then((mongooseInstance) => mongooseInstance);
    }


    cached.conn = await cached.promise;
    return cached.conn;
}
