import { PrismaClient, type MicrobeDetail, type Prisma, type Report, type ScanHistory } from "@prisma/client";
import type { ScanMetrics } from "@/types/microscope";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type ScanWithDetails = ScanHistory & { microbes: MicrobeDetail[] };

export async function saveScanHistory(
  metrics: ScanMetrics,
  options: { userId?: string; sourceName?: string; notes?: string }
): Promise<ScanWithDetails> {
  return prisma.scanHistory.create({
    data: {
      userId: options.userId,
      sourceName: options.sourceName,
      notes: options.notes,
      sourceWidth: metrics.width,
      sourceHeight: metrics.height,
      threshold: metrics.threshold,
      particleCount: metrics.particleCount,
      densityPerMl: metrics.densityPerMl,
      safetyScore: metrics.safetyScore,
      calibration: metrics.calibrationMicronsPerPixel,
      microbes: {
        create: metrics.categories.map((category) => ({
          category: category.category,
          count: category.count,
          meanAreaPx: category.meanAreaPx,
          meanSizeUm: category.meanSizeMicrometers
        }))
      }
    },
    include: { microbes: true }
  });
}

export async function saveScanAndReport(
  metrics: ScanMetrics,
  options: { userId?: string; sourceName?: string; notes?: string },
  assessment: string
): Promise<{ scan: ScanWithDetails; report: Report }> {
  return prisma.$transaction(async (transaction) => {
    const scan = await transaction.scanHistory.create({
      data: {
        userId: options.userId,
        sourceName: options.sourceName,
        notes: options.notes,
        sourceWidth: metrics.width,
        sourceHeight: metrics.height,
        threshold: metrics.threshold,
        particleCount: metrics.particleCount,
        densityPerMl: metrics.densityPerMl,
        safetyScore: metrics.safetyScore,
        calibration: metrics.calibrationMicronsPerPixel,
        microbes: {
          create: metrics.categories.map((category) => ({
            category: category.category,
            count: category.count,
            meanAreaPx: category.meanAreaPx,
            meanSizeUm: category.meanSizeMicrometers
          }))
        }
      },
      include: { microbes: true }
    });
    const report = await transaction.report.create({
      data: {
        scanId: scan.id,
        summary: `${scan.particleCount} particles detected in ${scan.sourceWidth}×${scan.sourceHeight} pixels.`,
        assessment
      }
    });
    return { scan, report };
  });
}

export async function getScanHistory(
  userId?: string,
  filters: { from?: Date; to?: Date; category?: string; take?: number } = {}
): Promise<ScanWithDetails[]> {
  const where: Prisma.ScanHistoryWhereInput = {
    ...(userId ? { userId } : {}),
    ...(filters.from || filters.to
      ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
      : {}),
    ...(filters.category ? { microbes: { some: { category: filters.category } } } : {})
  };
  return prisma.scanHistory.findMany({
    where,
    include: { microbes: true },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(filters.take ?? 50, 1), 100)
  });
}

export async function deleteScanHistory(id: string, userId?: string): Promise<void> {
  const result = await prisma.scanHistory.deleteMany({
    where: { id, ...(userId ? { userId } : {}) }
  });
  if (result.count === 0) throw new Error("Scan was not found or cannot be deleted.");
}
