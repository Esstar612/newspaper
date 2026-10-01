import { createAskHandler } from "@/lib/ask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = createAskHandler();
