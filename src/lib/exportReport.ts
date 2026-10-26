import { jsPDF } from "jspdf";
import type { ScanResult } from "@/types/microscope";

export interface ReportExportOptions {
  scan: ScanResult;
  imageDataUrl?: string;
  reportText?: string;
}

export function downloadJsonReport({ scan, imageDataUrl, reportText }: ReportExportOptions): void {
  const content = JSON.stringify(
    {
      application: "BioVision AI",
      exportedAt: new Date().toISOString(),
      limitations:
        "Image morphology is not a validated species identification, pathogen diagnosis, antibiotic susceptibility test, or clinical risk assessment.",
      scan,
      reportText: reportText ?? null,
      snapshot: imageDataUrl ?? null
    },
    null,
    2
  );
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `biovision-scan-${scan.id}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadPdfReport({ scan, imageDataUrl, reportText }: ReportExportOptions): void {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  pdf.setFontSize(20);
  pdf.setTextColor(79, 70, 229);
  pdf.text("BioVision | Microscopy observation", 16, 20);
  pdf.setFontSize(10);
  pdf.setTextColor(95, 105, 125);
  pdf.text(`Scan ${scan.id}  |  ${new Date(scan.createdAt).toLocaleString()}`, 16, 28);
  pdf.setDrawColor(225, 230, 240);
  pdf.line(16, 33, pageWidth - 16, 33);
  pdf.setFontSize(12);
  pdf.setTextColor(23, 32, 51);
  pdf.text(`Particles detected: ${scan.particleCount}`, 16, 43);
  pdf.text(`Image: ${scan.sourceWidth} × ${scan.sourceHeight} px`, 16, 51);
  pdf.text(`Threshold: ${scan.threshold}  |  Heuristic safety indicator: ${scan.safetyScore}/100`, 16, 59);
  pdf.text(
    `Density: ${scan.densityPerMl === null ? "not available (sample volume not calibrated)" : `${scan.densityPerMl.toLocaleString()} particles/mL`}`,
    16,
    67
  );
  let y = 80;
  for (const category of scan.categories) {
    pdf.setFillColor(category.color);
    pdf.circle(18, y - 1.5, 1.6, "F");
    pdf.text(`${category.label}: ${category.count}`, 24, y);
    y += 8;
  }
  if (imageDataUrl) {
    try {
      pdf.addImage(imageDataUrl, "JPEG", 16, y + 3, Math.min(pageWidth - 32, 90), 55, undefined, "FAST");
      y += 64;
    } catch (error) {
      console.warn("Snapshot could not be embedded in PDF", error);
    }
  }
  if (reportText) {
    pdf.setFontSize(10);
    const lines = pdf.splitTextToSize(reportText, pageWidth - 32);
    if (y + lines.length * 5 > 270) {
      pdf.addPage();
      y = 20;
    }
    pdf.text(lines, 16, y + 3);
    y += lines.length * 5 + 8;
  }
  pdf.setFontSize(8);
  pdf.setTextColor(100, 110, 125);
  const disclaimer = pdf.splitTextToSize(
    "Research-use observation only. Image shape cannot identify species, establish pathogen status, diagnose disease, measure antibiotic sensitivity, or replace qualified laboratory analysis.",
    pageWidth - 32
  );
  pdf.text(disclaimer, 16, Math.min(y + 6, 280));
  pdf.save(`biovision-scan-${scan.id}.pdf`);
}
