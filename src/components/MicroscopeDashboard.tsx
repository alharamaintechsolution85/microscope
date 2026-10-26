"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, Camera, Check, ChevronDown, CircleHelp, Download, FileImage, FileText,
  Focus, History, ImagePlus, LoaderCircle, Microscope, Moon, Search, ShieldAlert,
  SlidersHorizontal, Sun, Upload, Video, X, ZoomIn
} from "lucide-react";
import { useSession, signIn, signOut } from "next-auth/react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { analyzeImageData } from "@/lib/microscopeEngine";
import { downloadJsonReport, downloadPdfReport } from "@/lib/exportReport";
import { CATEGORY_META, type ScanMetrics, type ScanResult } from "@/types/microscope";

const LOCALES = ["EN", "UR", "AR", "FR", "ES", "DE", "ZH", "JA"];
const RESOLUTIONS = [
  { label: "640 × 480", width: 640, height: 480 },
  { label: "1280 × 720", width: 1280, height: 720 },
  { label: "1920 × 1080", width: 1920, height: 1080 }
];

function idForScan(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `scan-${Date.now()}`;
}

export default function MicroscopeDashboard() {
  const { data: session } = useSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourcePixelsRef = useRef<ImageData | null>(null);
  const streamingRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<number | null>(null);
  const lastProcessRef = useRef(0);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [dark, setDark] = useState(false);
  const [reticle, setReticle] = useState(false);
  const [threshold, setThreshold] = useState(52);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [zoom, setZoom] = useState(1);
  const [resolution, setResolution] = useState(RESOLUTIONS[1]);
  const [micronsPerPixel, setMicronsPerPixel] = useState("");
  const [sampleVolume, setSampleVolume] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState("");
  const [notes, setNotes] = useState("");
  const [backendSummary, setBackendSummary] = useState("");
  const [locale, setLocale] = useState("EN");
  const [searchOpen, setSearchOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "register">("signin");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [dragging, setDragging] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; particleCount: number; createdAt: string }>>([]);

  const analyzeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width < 1 || canvas.height < 1) return;
    try {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      const result = analyzeImageData(context.getImageData(0, 0, canvas.width, canvas.height), {
        threshold,
        minArea: 5,
        micronsPerPixel: micronsPerPixel ? Number(micronsPerPixel) : null,
        sampleVolumeMl: sampleVolume ? Number(sampleVolume) : null
      });
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      context.putImageData(imageData, 0, 0);
      result.particles.forEach((particle) => {
        const meta = CATEGORY_META[particle.category];
        context.strokeStyle = meta.color;
        context.lineWidth = Math.max(1.5, canvas.width / 900);
        context.strokeRect(particle.x, particle.y, particle.width, particle.height);
      });
      const metrics = result.metrics;
      setScan((previous) => ({
        id: previous?.id ?? idForScan(),
        sourceWidth: metrics.width,
        sourceHeight: metrics.height,
        threshold: metrics.threshold,
        particleCount: metrics.particleCount,
        densityPerMl: metrics.densityPerMl,
        safetyScore: metrics.safetyScore,
        calibrationMicronsPerPixel: metrics.calibrationMicronsPerPixel,
        categories: metrics.categories,
        particles: result.particles,
        createdAt: previous?.createdAt ?? new Date().toISOString()
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Image analysis failed.");
    }
  }, [micronsPerPixel, sampleVolume, threshold]);

  const refreshStaticImage = useCallback(() => {
    const canvas = canvasRef.current;
    const source = sourcePixelsRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !source || !context || streamingRef.current) return null;
    const adjusted = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
    const brightnessFactor = brightness / 100;
    const contrastFactor = contrast / 100;
    for (let index = 0; index < adjusted.data.length; index += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        adjusted.data[index + channel] = Math.max(
          0,
          Math.min(255, ((adjusted.data[index + channel] - 128) * contrastFactor + 128) * brightnessFactor)
        );
      }
    }
    context.putImageData(adjusted, 0, 0);
    const result = analyzeImageData(adjusted, {
      threshold,
      micronsPerPixel: micronsPerPixel ? Number(micronsPerPixel) : null,
      sampleVolumeMl: sampleVolume ? Number(sampleVolume) : null
    });
    result.particles.forEach((particle) => {
      context.strokeStyle = CATEGORY_META[particle.category].color;
      context.lineWidth = 2;
      context.strokeRect(particle.x, particle.y, particle.width, particle.height);
    });
    const metrics = result.metrics;
    setScan((previous) => ({
      id: previous?.id ?? idForScan(),
      sourceWidth: metrics.width,
      sourceHeight: metrics.height,
      threshold: metrics.threshold,
      particleCount: metrics.particleCount,
      densityPerMl: metrics.densityPerMl,
      safetyScore: metrics.safetyScore,
      calibrationMicronsPerPixel: metrics.calibrationMicronsPerPixel,
      categories: metrics.categories,
      particles: result.particles,
      createdAt: previous?.createdAt ?? new Date().toISOString()
    }));
    return metrics.particleCount;
  }, [brightness, contrast, micronsPerPixel, sampleVolume, threshold]);

  useEffect(() => {
    refreshStaticImage();
  }, [refreshStaticImage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    canvas.width = 960;
    canvas.height = 600;
    context.fillStyle = "#111827";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#94a3b8";
    context.font = "16px Arial";
    context.textAlign = "center";
    context.fillText("Connect a microscope or upload an image to begin", canvas.width / 2, canvas.height / 2);
  }, []);

  useEffect(() => {
    if (!session?.user.id) return;
    let cancelled = false;
    fetch("/api/microscope/history")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not load scan history.");
        return payload as { scans: Array<{ id: string; particleCount: number; createdAt: string }> };
      })
      .then((payload) => {
        if (!cancelled) setHistory(payload.scans.map((item) => ({
          id: item.id,
          particleCount: item.particleCount,
          createdAt: item.createdAt
        })));
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load scan history.");
      });
    return () => { cancelled = true; };
  }, [session?.user.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((value) => !value);
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!streaming || !video || !canvas) return;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    let cancelled = false;
    const draw = (time: number) => {
      if (cancelled) return;
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
        const width = Math.min(video.videoWidth, 1280);
        const height = Math.round((video.videoHeight / video.videoWidth) * width);
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        context.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
        context.drawImage(video, 0, 0, width, height);
        context.filter = "none";
        if (time - lastProcessRef.current > 700) {
          lastProcessRef.current = time;
          analyzeCanvas();
        }
      }
      frameRef.current = requestAnimationFrame(draw);
    };
    frameRef.current = requestAnimationFrame(draw);
    return () => {
      cancelled = true;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [analyzeCanvas, brightness, contrast, streaming]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const startCamera = async (requestedResolution = resolution) => {
    setError("");
    try {
      streamingRef.current = false;
      setStreaming(false);
      sourcePixelsRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: requestedResolution.width },
          height: { ideal: requestedResolution.height },
          facingMode: "environment"
        }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      streamingRef.current = true;
      setStreaming(true);
    } catch (cause) {
      setError(cause instanceof Error ? `Camera unavailable: ${cause.message}` : "Camera permission was denied.");
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    streamingRef.current = false;
    setStreaming(false);
  };

  const processImage = async (file: File) => {
    setError("");
    setReport("");
    stopCamera();
    const allowedType = ["image/png", "image/jpeg", "image/webp", "image/tiff"].includes(file.type);
    const allowedExtension = /\.(png|jpe?g|webp|tif|tiff)$/i.test(file.name);
    if ((!allowedType && !allowedExtension) || file.size > 30 * 1024 * 1024) {
      if (file.size > 30 * 1024 * 1024) {
        setError("Images must be 30 MB or smaller.");
        return;
      }
      setError("Choose an image file (PNG, JPEG, WebP, or a browser-decodable TIFF).");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d", { willReadFrequently: true });
      if (!canvas || !context) throw new Error("Image canvas is not available.");
      const scale = Math.min(1, 1600 / bitmap.width, 1200 / bitmap.height);
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      sourcePixelsRef.current = context.getImageData(0, 0, canvas.width, canvas.height);
      bitmap.close();
      const particleCount = refreshStaticImage() ?? 0;
      setBackendSummary("");
      setHistory((items) => [{ id: file.name, particleCount, createdAt: new Date().toISOString() }, ...items].slice(0, 5));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The image could not be decoded.");
    }
  };

  const makeMetrics = (current: ScanResult): ScanMetrics => ({
    width: current.sourceWidth,
    height: current.sourceHeight,
    threshold: current.threshold,
    particleCount: current.particleCount,
    densityPerMl: current.densityPerMl,
    safetyScore: current.safetyScore,
    calibrationMicronsPerPixel: current.calibrationMicronsPerPixel,
    categories: current.categories
  });

  const analyzeWithService = async () => {
    if (!scan) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/microscope/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics: makeMetrics(scan) })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Analysis service failed.");
      setBackendSummary(result.modelSummary || result.interpretation);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analysis service failed.");
    } finally {
      setBusy(false);
    }
  };

  const generateReport = async () => {
    if (!scan) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/microscope/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics: makeMetrics(scan), notes })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Report generation failed.");
      setReport(result.assessment);
      setScan((current) => current ? { ...current, id: result.scanId } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Report generation failed.");
    } finally {
      setBusy(false);
    }
  };

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (authMode === "register") {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: authName, email: authEmail, password: authPassword })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Registration failed.");
      }
      const result = await signIn("credentials", {
        email: authEmail,
        password: authPassword,
        redirect: false
      });
      if (!result || result.error) throw new Error("Email or password was not accepted.");
      setAuthOpen(false);
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  const takeSnapshot = () => {
    if (!scan || !canvasRef.current) return;
    const image = canvasRef.current.toDataURL("image/jpeg", 0.9);
    downloadJsonReport({ scan, imageDataUrl: image, reportText: report });
  };

  const chartData = scan?.categories.map((item) => ({ name: item.label, count: item.count, fill: item.color })) ?? [];

  return (
    <div className={`app-shell min-h-screen ${dark ? "dark" : ""}`}>
      <header className="sticky top-0 z-20 border-b" style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white"><Microscope size={22} /></div>
            <div><div className="text-[15px] font-bold tracking-tight">BioVision <span className="text-indigo-500">AI</span></div><div className="text-[11px] subtle">MICROSCOPE ANALYZER</div></div>
          </div>
          <button onClick={() => setSearchOpen(true)} className="hidden w-full max-w-[400px] items-center gap-2 rounded-lg border px-3 py-2 text-left sm:flex" style={{ borderColor: "var(--line)", color: "var(--subtle)" }}>
            <Search size={16} /> <span className="flex-1">Search scans, settings...</span><kbd className="rounded border px-1.5 py-0.5 text-[10px]">⌘ K</kbd>
          </button>
          <div className="flex items-center gap-2">
            <select aria-label="Language" value={locale} onChange={(event) => setLocale(event.target.value)} className="hidden sm:block">{LOCALES.map((item) => <option key={item}>{item}</option>)}</select>
            <button aria-label="Toggle color theme" className="outline-button !p-2" onClick={() => setDark((value) => !value)}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
            {session?.user ? <button className="outline-button" onClick={() => signOut()}>{session.user.name || session.user.email} <ChevronDown size={14} /></button> : <button className="outline-button" onClick={() => setAuthOpen(true)}><span>Sign in</span></button>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.12em] text-indigo-500"><Activity size={14} /> Research workspace</div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Microscope analysis</h1>
            <p className="mt-1 subtle">Inspect image morphology and quantify detected particles.</p>
          </div>
          <div className="flex gap-2">
            <button className="outline-button" onClick={() => { if (scan) downloadJsonReport({ scan, reportText: report }); }} disabled={!scan}><Download size={16} /> Export JSON</button>
            <button className="primary-button" onClick={() => { if (scan) downloadPdfReport({ scan, reportText: report }); }} disabled={!scan}><FileText size={16} /> Export PDF</button>
          </div>
        </div>

        <div className="screen-grid">
          <section className="panel min-w-0 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${streaming ? "animate-pulse bg-rose-500" : "bg-slate-300"}`} /><h2 className="font-semibold">Live microscope</h2><span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ background: "var(--soft)", color: "var(--subtle)" }}>{streaming ? "LIVE" : "READY"}</span></div>
              <div className="flex gap-2">
                <button className="outline-button !px-2.5" onClick={() => setZoom((value) => Math.min(2.5, +(value + .1).toFixed(1)))} title="Zoom in"><ZoomIn size={16} /> {Math.round(zoom * 100)}%</button>
                <button className="outline-button !px-2.5" onClick={() => setReticle((value) => !value)} title="Toggle reticle"><Focus size={16} /> <span className="hidden md:inline">Reticle</span></button>
              </div>
            </div>

            <div className={`canvas-wrap ${reticle ? "reticle" : ""}`}>
              <video ref={videoRef} className="hidden" playsInline muted />
              <canvas ref={canvasRef} style={{ transform: `scale(${zoom})`, transformOrigin: "center" }} />
              {streaming && <div className="scanline" />}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {streaming
                ? <button className="primary-button !bg-rose-500 hover:!bg-rose-600" onClick={stopCamera}><Video size={16} /> Stop camera</button>
                : <button className="primary-button" onClick={() => void startCamera()}><Camera size={16} /> Connect camera</button>}
              <button className="outline-button" onClick={() => fileInputRef.current?.click()}><Upload size={16} /> Upload image</button>
              <input ref={fileInputRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/tiff,.tif,.tiff" onChange={(event) => { const file = event.target.files?.[0]; if (file) void processImage(file); event.currentTarget.value = ""; }} />
              <button className="outline-button" onClick={takeSnapshot} disabled={!scan}><ImagePlus size={16} /> Snapshot JSON</button>
              <select aria-label="Camera resolution" value={resolution.label} onChange={(event) => { const next = RESOLUTIONS.find((item) => item.label === event.target.value) ?? RESOLUTIONS[1]; setResolution(next); if (streaming) void startCamera(next); }}>{RESOLUTIONS.map((item) => <option key={item.label}>{item.label}</option>)}</select>
              <div className="drop-target ml-auto flex items-center gap-2 rounded-lg px-3 py-2 text-xs subtle" onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) void processImage(file); }} style={dragging ? { borderColor: "#6366f1", color: "#6366f1" } : undefined}>
                <FileImage size={15} /> Drop image here
              </div>
            </div>

            <div className="mt-5 grid gap-4 rounded-xl p-4 sm:grid-cols-2" style={{ background: "var(--soft)" }}>
              <div><label className="mb-2 flex items-center justify-between text-xs font-medium">Threshold <span className="mono subtle">{threshold}</span></label><input aria-label="Image threshold" className="w-full" type="range" min="5" max="220" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /></div>
              <div><label className="mb-2 flex items-center justify-between text-xs font-medium">Brightness <span className="mono subtle">{brightness}%</span></label><input aria-label="Brightness" className="w-full" type="range" min="50" max="160" value={brightness} onChange={(event) => setBrightness(Number(event.target.value))} /></div>
              <div><label className="mb-2 flex items-center justify-between text-xs font-medium">Contrast <span className="mono subtle">{contrast}%</span></label><input aria-label="Contrast" className="w-full" type="range" min="50" max="200" value={contrast} onChange={(event) => setContrast(Number(event.target.value))} /></div>
              <div><label className="mb-2 flex items-center justify-between text-xs font-medium">Calibration (µm / pixel) <CircleHelp size={13} className="subtle" /></label><input type="number" min="0" step="0.01" placeholder="Optional" value={micronsPerPixel} onChange={(event) => setMicronsPerPixel(event.target.value)} className="w-full" /></div>
              <div className="sm:col-span-2"><label className="mb-2 block text-xs font-medium">Sample volume (mL), for density estimate</label><input type="number" min="0" step="0.0001" placeholder="Optional — density stays unavailable until provided" value={sampleVolume} onChange={(event) => setSampleVolume(event.target.value)} className="w-full sm:max-w-[260px]" /></div>
            </div>
            {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><ShieldAlert size={17} className="mt-0.5 shrink-0" /><span>{error}</span><button aria-label="Dismiss error" className="ml-auto" onClick={() => setError("")}><X size={16} /></button></div>}
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              <b>Research-use estimate:</b> particle categories describe image shape only—not E. coli, Lactobacillus, Staphylococcus, or clinical safety. Calibrated optics and a known sample volume are required for µm measurements and cells/mL estimates.
            </div>
          </section>

          <aside className="space-y-4">
            <section className="panel p-5">
              <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Scan summary</h2><SlidersHorizontal size={16} className="subtle" /></div>
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl p-3" style={{ background: "var(--soft)" }}><div className="text-xs subtle">Particles</div><div className="mt-1 text-2xl font-bold">{scan?.particleCount.toLocaleString() ?? "—"}</div></div>
                <div className="rounded-xl p-3" style={{ background: "var(--soft)" }}><div className="text-xs subtle">Density / mL</div><div className="mt-1 text-lg font-bold">{scan?.densityPerMl == null ? "—" : scan.densityPerMl.toLocaleString()}</div></div>
              </div>
              <div className="mb-2 flex justify-between text-xs"><span className="subtle">Heuristic indicator</span><b>{scan ? `${scan.safetyScore}/100` : "—"}</b></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${scan?.safetyScore ?? 0}%` }} /></div>
              <p className="mt-2 text-[11px] leading-4 subtle">Not a medical or contamination safety score.</p>
              <div className="mt-5 h-[170px]">
                {scan ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 10, right: 8, left: -25, bottom: 0 }}><defs>{chartData.map((item) => <linearGradient key={item.name} id={`fill-${item.name.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={item.fill} stopOpacity={.35} /><stop offset="95%" stopColor={item.fill} stopOpacity={0} /></linearGradient>)}</defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="name" tick={{ fontSize: 9, fill: "var(--subtle)" }} interval={0} /><YAxis tick={{ fontSize: 10, fill: "var(--subtle)" }} allowDecimals={false} /><Tooltip contentStyle={{ background: "var(--surface)", borderColor: "var(--line)", borderRadius: 10, fontSize: 12 }} /><Area type="monotone" dataKey="count" stroke="#6366f1" fill="#6366f1" fillOpacity={.12} /></AreaChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-xs subtle">Upload an image to view particle counts</div>}
              </div>
              <div className="mt-2 space-y-2">
                {scan?.categories.map((category) => <div key={category.category} className="flex items-center justify-between text-xs"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: category.color }} />{category.label}</span><b>{category.count}</b></div>)}
              </div>
              <button className="primary-button mt-5 w-full" onClick={analyzeWithService} disabled={!scan || busy}><Activity size={16} /> {busy ? "Processing..." : "AI-assisted summary"}</button>
              {backendSummary && <p className="mt-3 rounded-lg p-3 text-xs leading-5" style={{ background: "var(--soft)" }}>{backendSummary}</p>}
            </section>

            <section className="panel p-5">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Observation report</h2><FileText size={16} className="subtle" /></div>
              <p className="mb-4 text-xs leading-5 subtle">Generate a cautious AI-written summary of measured image metrics. It cannot provide a clinical diagnosis.</p>
              <textarea aria-label="Report notes" placeholder="Optional observation notes" maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} className="mb-3 min-h-[74px] w-full rounded-lg border p-2 text-xs" style={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--text)" }} />
              <button className="outline-button w-full" onClick={generateReport} disabled={!scan || busy}><span>{busy ? <LoaderCircle size={15} className="animate-spin" /> : <FileText size={15} />}</span> Generate & save report</button>
              {report && <div className="mt-4 whitespace-pre-wrap rounded-lg p-3 text-xs leading-5" style={{ background: "var(--soft)" }}>{report}</div>}
            </section>

            <section className="panel p-5">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Recent local scans</h2><History size={16} className="subtle" /></div>
              {history.length ? <div className="space-y-3">{history.map((item, index) => <div key={`${item.id}-${index}`} className="flex items-center justify-between gap-2 text-xs"><span className="max-w-[175px] truncate">{item.id}</span><span className="shrink-0 subtle">{item.particleCount} particles</span></div>)}</div> : <p className="text-xs subtle">No scans in this session yet.</p>}
              <p className="mt-3 text-[10px] leading-4 subtle">Sign-in history is available through the authenticated API. Local session list is cleared when this page reloads.</p>
            </section>
          </aside>
        </div>
        <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 pb-4 text-[11px] subtle">
          <span className="flex items-center gap-1.5"><Check size={13} className="text-cyan-600" /> Local image processing is performed in your browser</span>
          <span>BioVision AI · Research-use software · Not for clinical diagnosis</span>
        </footer>
      </main>

      <AnimatePresence>
        {searchOpen && <motion.div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 px-4 pt-[15vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSearchOpen(false)}><motion.div className="panel w-full max-w-xl p-4" initial={{ y: -10 }} animate={{ y: 0 }} exit={{ y: -10 }} onClick={(event) => event.stopPropagation()}><div className="flex items-center gap-3"><Search size={17} className="subtle" /><input autoFocus placeholder="Search this workspace..." className="w-full border-0 bg-transparent outline-none" /><button onClick={() => setSearchOpen(false)}><X size={17} /></button></div><p className="mt-4 border-t pt-3 text-xs subtle" style={{ borderColor: "var(--line)" }}>Quick actions: upload an image, connect a camera, export a report.</p><button className="mt-2 outline-button" onClick={() => { setSearchOpen(false); fileInputRef.current?.click(); }}><Upload size={15} /> Upload image</button></motion.div></motion.div>}
        {authOpen && <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAuthOpen(false)}><motion.form className="panel w-full max-w-md p-6" initial={{ y: 10 }} animate={{ y: 0 }} exit={{ y: 10 }} onClick={(event) => event.stopPropagation()} onSubmit={submitAuth}><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{authMode === "register" ? "Create account" : "Sign in"}</h2><button type="button" aria-label="Close sign-in dialog" onClick={() => setAuthOpen(false)}><X size={18} /></button></div>{authMode === "register" && <input required maxLength={80} value={authName} onChange={(event) => setAuthName(event.target.value)} placeholder="Name" className="mb-3 w-full rounded-lg border p-2.5" style={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--text)" }} />}<input required type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="Email" className="mb-3 w-full rounded-lg border p-2.5" style={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--text)" }} /><input required minLength={10} maxLength={128} type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="Password (at least 10 characters)" className="mb-4 w-full rounded-lg border p-2.5" style={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--text)" }} /><button className="primary-button w-full" disabled={busy}>{busy ? "Please wait..." : authMode === "register" ? "Create account" : "Sign in"}</button><button type="button" className="mt-3 w-full text-xs text-indigo-600" onClick={() => setAuthMode((mode) => mode === "register" ? "signin" : "register")}>{authMode === "register" ? "Already registered? Sign in" : "New here? Create an account"}</button><button type="button" className="mt-2 w-full text-xs subtle" onClick={() => void signIn("google")}>Continue with Google (configure OAuth)</button></motion.form></motion.div>}
      </AnimatePresence>
    </div>
  );
}
