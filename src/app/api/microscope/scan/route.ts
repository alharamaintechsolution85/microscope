import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { z } from "zod";
import { getRateLimiter, getRedis, requestHash } from "@/lib/apiSecurity";
import { CATEGORY_META, type MicrobeCategory } from "@/types/microscope";

export const runtime = "nodejs";

const categorySchema = z.object({
  category: z.enum(["rodLike", "small", "clusters", "unknown"]),
  count: z.number().int().min(0).max(1000000),
  meanAreaPx: z.number().min(0).max(100000000),
  meanSizeMicrometers: z.number().min(0).max(1000000).nullable()
});

const requestSchema = z.object({
  metrics: z.object({
    width: z.number().int().positive().max(12000),
    height: z.number().int().positive().max(12000),
    threshold: z.number().int().min(0).max(255),
    particleCount: z.number().int().min(0).max(2500),
    densityPerMl: z.number().min(0).nullable(),
    safetyScore: z.number().int().min(0).max(100),
    calibrationMicronsPerPixel: z.number().positive().nullable(),
    categories: z.array(categorySchema).length(4)
  }),
  sourceName: z.string().max(200).optional()
}).superRefine(({ metrics }, context) => {
  const categoryCount = metrics.categories.reduce((sum, category) => sum + category.count, 0);
  if (categoryCount !== metrics.particleCount) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["metrics", "categories"],
      message: "Category counts must add up to the particle count."
    });
  }
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid scan metrics.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const limiter = getRateLimiter();
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limit = await limiter.limit(ip);
    if (!limit.success) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again later." }, { status: 429 });
    }

    const hash = requestHash(parsed.data.metrics);
    const client = getRedis();
    const cacheKey = `biovision:scan:${hash}`;
    const cached = await client.get<Record<string, unknown>>(cacheKey);
    if (cached) return NextResponse.json({ ...cached, cached: true });
    const lockKey = `biovision:scan:inflight:${hash}`;
    const lock = await client.set(lockKey, "1", { nx: true, ex: 30 });
    if (lock !== "OK") {
      return NextResponse.json({ error: "This scan is already being processed. Retry shortly." }, { status: 409 });
    }

    let modelSummary: string | null = null;
    if (process.env.GROQ_API_KEY) {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 180,
        messages: [
          {
            role: "system",
            content:
              "Summarize these image-processing metrics in one cautious sentence. Do not infer species, pathogen status, clinical risk, or medical advice from morphology."
          },
          { role: "user", content: JSON.stringify(parsed.data.metrics) }
        ]
      });
      modelSummary = completion.choices[0]?.message?.content?.trim() || null;
    }

    const categories = parsed.data.metrics.categories.map((category) => ({
      ...category,
      label: CATEGORY_META[category.category as MicrobeCategory].label,
      color: CATEGORY_META[category.category as MicrobeCategory].color
    }));
    const result = {
      metrics: { ...parsed.data.metrics, categories },
      modelSummary,
      interpretation:
        "Categories describe image shape only. This scan cannot identify species, determine pathogenicity, or replace laboratory testing."
    };
    await client.set(cacheKey, result, { ex: 300 });
    const telemetryKey = "biovision:scan:telemetry";
    await client.lpush(
      telemetryKey,
      JSON.stringify({
        scanHash: hash,
        at: new Date().toISOString(),
        particleCount: parsed.data.metrics.particleCount,
        densityPerMl: parsed.data.metrics.densityPerMl
      })
    );
    await client.ltrim(telemetryKey, 0, 99);
    await client.expire(telemetryKey, 86400);
    await client.del(lockKey);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Microscope scan service failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Microscope scan service failed." },
      { status: 503 }
    );
  }
}
