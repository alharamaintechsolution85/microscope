import { GoogleGenerativeAI } from "@google/generative-ai";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { saveScanAndReport } from "@/lib/db";
import { getRateLimiter } from "@/lib/apiSecurity";

export const runtime = "nodejs";

const reportSchema = z.object({
  metrics: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    threshold: z.number().int().min(0).max(255),
    particleCount: z.number().int().min(0),
    densityPerMl: z.number().min(0).nullable(),
    safetyScore: z.number().int().min(0).max(100),
    calibrationMicronsPerPixel: z.number().positive().nullable(),
    categories: z.array(
      z.object({
        category: z.enum(["rodLike", "small", "clusters", "unknown"]),
        label: z.string().max(80),
        color: z.string().max(20),
        count: z.number().int().min(0),
        meanAreaPx: z.number().min(0),
        meanSizeMicrometers: z.number().min(0).nullable()
      })
    ).length(4)
  }),
  sourceName: z.string().max(200).optional(),
  notes: z.string().max(2000).optional()
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
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid report data.", details: parsed.error.flatten() }, { status: 400 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Gemini reporting is not configured. Set GEMINI_API_KEY." }, { status: 503 });
  }

  try {
    const limiter = getRateLimiter();
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limit = await limiter.limit(`report:${ip}`);
    if (!limit.success) return NextResponse.json({ error: "Rate limit exceeded. Try again later." }, { status: 429 });

    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({
      model: "gemini-2.5-flash"
    });
    const generated = await model.generateContent(
      `Write a concise, non-diagnostic microscopy observation using only the supplied image-analysis metrics. Explicitly state that morphology cannot establish bacterial species, pathogen status, antibiotic susceptibility, or clinical risk. Do not recommend antibiotics. Identify calibration/volume uncertainty. Return plain text with headings Observation and Limitations.\n\n${JSON.stringify(
        parsed.data.metrics
      )}`
    );
    const assessment = generated.response.text().trim();
    if (!assessment) throw new Error("The report provider returned an empty assessment.");

    const session = await getServerSession(authOptions);
    const { scan, report } = await saveScanAndReport(parsed.data.metrics, {
      userId: session?.user.id,
      sourceName: parsed.data.sourceName,
      notes: parsed.data.notes
    }, assessment);

    return NextResponse.json({ scanId: scan.id, reportId: report.id, summary: report.summary, assessment });
  } catch (error) {
    console.error("Report generation failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Report generation failed." },
      { status: 503 }
    );
  }
}
