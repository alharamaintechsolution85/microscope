export type MicrobeCategory = "rodLike" | "small" | "clusters" | "unknown";

export interface Particle {
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  perimeter: number;
  category: MicrobeCategory;
  sizeMicrometers: number | null;
}

export interface CategorySummary {
  category: MicrobeCategory;
  label: string;
  color: string;
  count: number;
  meanAreaPx: number;
  meanSizeMicrometers: number | null;
}

export interface ScanResult {
  id: string;
  sourceWidth: number;
  sourceHeight: number;
  threshold: number;
  particleCount: number;
  densityPerMl: number | null;
  safetyScore: number;
  calibrationMicronsPerPixel: number | null;
  categories: CategorySummary[];
  particles: Particle[];
  createdAt: string;
}

export interface ScanMetrics {
  width: number;
  height: number;
  threshold: number;
  particleCount: number;
  densityPerMl: number | null;
  safetyScore: number;
  calibrationMicronsPerPixel: number | null;
  categories: CategorySummary[];
}

export const CATEGORY_META: Record<MicrobeCategory, { label: string; color: string }> = {
  rodLike: { label: "Rod-like particles", color: "#F43F5E" },
  small: { label: "Small particles", color: "#3B82F6" },
  clusters: { label: "Round clusters", color: "#A855F7" },
  unknown: { label: "Other particles", color: "#F59E0B" }
};
