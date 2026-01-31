import { connectDB } from "@/lib/db";
import { Article } from "@/models/Article";

export async function GET() {
    await connectDB();

    // Just touching the model ensures it compiles correctly
    const count = await Article.countDocuments();

    return Response.json({ status: "ok", db: "connected", articles: count });
}
