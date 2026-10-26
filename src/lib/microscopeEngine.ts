import {
  CATEGORY_META,
  type CategorySummary,
  type MicrobeCategory,
  type Particle,
  type ScanMetrics
} from "@/types/microscope";

export interface AnalyzeOptions {
  threshold?: number;
  minArea?: number;
  maxArea?: number;
  micronsPerPixel?: number | null;
  sampleVolumeMl?: number | null;
  maxParticles?: number;
}

interface Component {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
  perimeter: number;
}

const CATEGORY_ORDER: MicrobeCategory[] = ["rodLike", "small", "clusters", "unknown"];

function classifyParticle(width: number, height: number, area: number): MicrobeCategory {
  const aspect = Math.max(width, height) / Math.max(1, Math.min(width, height));
  const fill = area / Math.max(1, width * height);
  if (aspect >= 1.65) return "rodLike";
  if (fill >= 0.68 && aspect < 1.35) return "clusters";
  if (area <= 18 || (area <= 42 && aspect < 1.4)) return "small";
  return "unknown";
}

function summarize(particles: Particle[]): CategorySummary[] {
  return CATEGORY_ORDER.map((category) => {
    const matching = particles.filter((particle) => particle.category === category);
    const meta = CATEGORY_META[category];
    return {
      category,
      label: meta.label,
      color: meta.color,
      count: matching.length,
      meanAreaPx: matching.length
        ? matching.reduce((sum, particle) => sum + particle.area, 0) / matching.length
        : 0,
      meanSizeMicrometers:
        matching.length && matching.every((particle) => particle.sizeMicrometers !== null)
          ? matching.reduce((sum, particle) => sum + (particle.sizeMicrometers ?? 0), 0) /
            matching.length
          : null
    };
  });
}

export function analyzeImageData(
  imageData: ImageData,
  options: AnalyzeOptions = {}
): { metrics: ScanMetrics; particles: Particle[]; mask: Uint8Array } {
  const { width, height, data } = imageData;
  if (!width || !height || data.length !== width * height * 4) {
    throw new Error("Invalid image pixel data.");
  }

  const threshold = Math.max(0, Math.min(255, options.threshold ?? 52));
  const minArea = Math.max(1, options.minArea ?? 5);
  const maxArea = Math.max(minArea, options.maxArea ?? Math.floor(width * height * 0.08));
  const maxParticles = Math.max(1, options.maxParticles ?? 2500);
  const micronsPerPixel =
    options.micronsPerPixel != null && Number.isFinite(options.micronsPerPixel) && options.micronsPerPixel > 0
      ? options.micronsPerPixel
      : null;
  const mask = new Uint8Array(width * height);

  for (let pixel = 0, offset = 0; pixel < mask.length; pixel += 1, offset += 4) {
    const luminance = 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
    mask[pixel] = luminance < threshold ? 1 : 0;
  }

  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const found: Particle[] = [];
  const neighborOffsets = [-1, 1, -width, width];

  for (let start = 0; start < mask.length && found.length < maxParticles; start += 1) {
    if (!mask[start] || visited[start]) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    const component: Component = {
      minX: width,
      minY: height,
      maxX: 0,
      maxY: 0,
      area: 0,
      perimeter: 0
    };

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      component.area += 1;
      component.minX = Math.min(component.minX, x);
      component.minY = Math.min(component.minY, y);
      component.maxX = Math.max(component.maxX, x);
      component.maxY = Math.max(component.maxY, y);

      for (const delta of neighborOffsets) {
        const neighbor = index + delta;
        const isBoundary =
          neighbor < 0 ||
          neighbor >= mask.length ||
          (delta === -1 && x === 0) ||
          (delta === 1 && x === width - 1);
        if (isBoundary || !mask[neighbor]) {
          component.perimeter += 1;
        } else if (!visited[neighbor]) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }

    if (component.area < minArea || component.area > maxArea) continue;
    const boxWidth = component.maxX - component.minX + 1;
    const boxHeight = component.maxY - component.minY + 1;
    const sizeMicrometers = micronsPerPixel
      ? Math.sqrt(component.area / Math.PI) * 2 * micronsPerPixel
      : null;
    found.push({
      x: component.minX,
      y: component.minY,
      width: boxWidth,
      height: boxHeight,
      area: component.area,
      perimeter: component.perimeter,
      category: classifyParticle(boxWidth, boxHeight, component.area),
      sizeMicrometers
    });
  }

  const categories = summarize(found);
  const count = found.length;
  const densityPerMl =
    options.sampleVolumeMl != null &&
    Number.isFinite(options.sampleVolumeMl) &&
    options.sampleVolumeMl > 0
      ? count / options.sampleVolumeMl
      : null;
  const safetyScore = Math.max(0, Math.min(100, Math.round(100 - (categories[0].count / Math.max(count, 1)) * 100)));

  return {
    particles: found,
    mask,
    metrics: {
      width,
      height,
      threshold,
      particleCount: count,
      densityPerMl,
      safetyScore,
      calibrationMicronsPerPixel: micronsPerPixel,
      categories
    }
  };
}

export function analyzeCanvas(
  canvas: HTMLCanvasElement,
  options: AnalyzeOptions = {}
): { metrics: ScanMetrics; particles: Particle[] } {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D context is not available.");
  const result = analyzeImageData(context.getImageData(0, 0, canvas.width, canvas.height), options);
  return { metrics: result.metrics, particles: result.particles };
}
