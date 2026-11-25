"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatDuration } from "@/lib/utils";
import { reduceWaveformPeaks, type WaveformPeak } from "@/lib/waveform-utils";

interface WaveformProps {
  waveformData: WaveformPeak[];
  duration: number;
  currentTime: number;
  onSeek: (position: number) => void;
  height?: number;
  variant?: "list" | "detail";
  isLoading?: boolean;
  color?: string;
  reflectionColor?: string;
  progressColor?: string;
  progressReflectionColor?: string;
}

function robustMaximum(peaks: WaveformPeak[]) {
  if (!peaks.length) return 1;
  const values = peaks
    .map((peak) => Math.max(Math.abs(peak.min), Math.abs(peak.max)))
    .sort((left, right) => left - right);
  const index = Math.min(values.length - 1, Math.floor(values.length * 0.995));
  return Math.max(values[index] ?? 1, 0.04);
}

function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: WaveformPeak[],
  width: number,
  height: number,
  pixelRatio: number,
  variant: "list" | "detail",
  upperColor: string,
  lowerColor: string,
  drawAxis: boolean,
) {
  canvas.width = Math.max(1, Math.round(width * pixelRatio));
  canvas.height = Math.max(1, Math.round(height * pixelRatio));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);

  const baseline = Math.round(height * (variant === "detail" ? 0.53 : 0.66));
  const topRoom = baseline - 3;
  const reflectionRoom = height - baseline - 3;
  const pitch = width / Math.max(peaks.length, 1);
  const barWidth = Math.max(1, Math.min(1.35, pitch * 0.68));
  const scale = robustMaximum(peaks);

  if (drawAxis) {
    context.fillStyle = "rgba(255, 255, 255, 0.18)";
    context.fillRect(0, baseline, width, 1);
  }

  peaks.forEach((peak, index) => {
    const amplitude = Math.min(
      1,
      Math.max(Math.abs(peak.min), Math.abs(peak.max)) / scale,
    );
    const upperHeight = Math.max(2, Math.round(amplitude * topRoom));
    const reflectionHeight = Math.max(
      1,
      Math.round(amplitude * reflectionRoom * 0.86),
    );
    const x = index * pitch + (pitch - barWidth) / 2;

    context.fillStyle = upperColor;
    context.fillRect(x, baseline - upperHeight, barWidth, upperHeight);
    context.fillStyle = lowerColor;
    context.fillRect(x, baseline + 2, barWidth, reflectionHeight);
  });
}

export default function WaveformVisualizer({
  waveformData,
  duration,
  currentTime,
  onSeek,
  height = 72,
  variant = "list",
  isLoading = false,
  color = "#b7b9bd",
  reflectionColor = "#4b4d52",
  progressColor = "#ff5500",
  progressReflectionColor = "#8f300f",
}: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const progressCanvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => setWidth(container.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const visiblePeaks = useMemo(() => {
    const barPitch = variant === "detail" ? 2 : 2.15;
    return reduceWaveformPeaks(
      waveformData,
      Math.max(1, Math.floor(width / barPitch)),
    );
  }, [variant, waveformData, width]);

  useEffect(() => {
    if (!width || !visiblePeaks.length) return;
    const pixelRatio = window.devicePixelRatio || 1;
    if (baseCanvasRef.current) {
      drawWaveform(
        baseCanvasRef.current,
        visiblePeaks,
        width,
        height,
        pixelRatio,
        variant,
        color,
        reflectionColor,
        true,
      );
    }
    if (progressCanvasRef.current) {
      drawWaveform(
        progressCanvasRef.current,
        visiblePeaks,
        width,
        height,
        pixelRatio,
        variant,
        progressColor,
        progressReflectionColor,
        false,
      );
    }
  }, [
    color,
    height,
    progressColor,
    progressReflectionColor,
    reflectionColor,
    variant,
    visiblePeaks,
    width,
  ]);

  const ratioFromPointer = useCallback((clientX: number) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds?.width) return 0;
    return Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
  }, []);

  const seekToRatio = useCallback(
    (ratio: number) => {
      if (duration > 0) onSeek(ratio * duration);
    },
    [duration, onSeek],
  );
  const progress =
    duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;
  const baselinePercent = variant === "detail" ? 53 : 66;

  return (
    <div
      ref={containerRef}
      className="relative w-full cursor-pointer overflow-hidden select-none"
      style={{ height }}
      role="slider"
      tabIndex={0}
      aria-label="Seek through track"
      aria-valuemin={0}
      aria-valuemax={Math.max(0, duration)}
      aria-valuenow={Math.max(0, currentTime)}
      onMouseMove={(event) => setHoverRatio(ratioFromPointer(event.clientX))}
      onMouseLeave={() => setHoverRatio(null)}
      onClick={(event) => seekToRatio(ratioFromPointer(event.clientX))}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft")
          seekToRatio(Math.max(0, progress - 0.01));
        if (event.key === "ArrowRight")
          seekToRatio(Math.min(1, progress + 0.01));
      }}
    >
      <canvas ref={baseCanvasRef} className="absolute inset-0" />
      <div
        className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: `${progress * 100}%` }}
      >
        <canvas
          ref={progressCanvasRef}
          className="absolute inset-0 max-w-none"
        />
      </div>

      {!visiblePeaks.length && (
        <div className="absolute inset-0 flex items-center">
          <div
            className="h-2/3 w-full animate-pulse opacity-40"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, #71717a 0, #71717a 1px, transparent 1px, transparent 3px)",
            }}
            aria-label={
              isLoading ? "Waveform is processing" : "Waveform unavailable"
            }
          />
        </div>
      )}

      {hoverRatio !== null && visiblePeaks.length > 0 && (
        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-px bg-white/80"
          style={{ left: `${hoverRatio * 100}%` }}
        />
      )}

      {duration > 0 && (
        <>
          {progress > 0 && (
            <span
              className="pointer-events-none absolute z-20 -translate-y-full bg-black/80 px-1 py-0.5 text-[10px] leading-none font-semibold text-white tabular-nums"
              style={{
                left: `${progress * 100}%`,
                top: `${baselinePercent}%`,
                transform:
                  progress > 0.9
                    ? "translate(-100%, -100%)"
                    : "translate(0, -100%)",
              }}
            >
              {formatDuration(currentTime)}
            </span>
          )}
          <span
            className="pointer-events-none absolute right-0 z-20 bg-black/80 px-1 py-0.5 text-[10px] leading-none font-semibold text-zinc-200 tabular-nums"
            style={{ top: `${baselinePercent + 2}%` }}
          >
            {formatDuration(duration)}
          </span>
        </>
      )}
    </div>
  );
}
