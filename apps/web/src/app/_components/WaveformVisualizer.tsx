"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  reduceWaveformPeaks,
  type WaveformPeak,
} from "@/lib/waveform-utils";

interface WaveformProps {
  waveformData: WaveformPeak[];
  duration: number;
  currentTime: number;
  onSeek: (position: number) => void;
  height?: number;
  color?: string;
  progressColor?: string;
  backgroundColor?: string;
}

function percentileAmplitude(peaks: WaveformPeak[]) {
  if (!peaks.length) return 1;
  const amplitudes = peaks
    .map((peak) => Math.max(Math.abs(peak.min), Math.abs(peak.max)))
    .sort((left, right) => left - right);
  const index = Math.min(
    amplitudes.length - 1,
    Math.floor(amplitudes.length * 0.995),
  );
  return Math.max(amplitudes[index] ?? 1, 0.05);
}

function drawPeaks(
  canvas: HTMLCanvasElement,
  peaks: WaveformPeak[],
  width: number,
  height: number,
  devicePixelRatio: number,
  color: string,
  backgroundColor?: string,
) {
  canvas.width = Math.max(1, Math.round(width * devicePixelRatio));
  canvas.height = Math.max(1, Math.round(height * devicePixelRatio));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  if (backgroundColor && backgroundColor !== "transparent") {
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, width, height);
  }

  const pitch = width / Math.max(1, peaks.length);
  const barWidth = Math.max(1, Math.min(2, pitch * 0.72));
  const center = height / 2;
  const verticalScale = (height * 0.46) / percentileAmplitude(peaks);
  context.fillStyle = color;

  peaks.forEach((peak, index) => {
    const top = center - Math.max(0, peak.max) * verticalScale;
    const bottom = center - Math.min(0, peak.min) * verticalScale;
    const barHeight = Math.max(2, bottom - top);
    const x = index * pitch + (pitch - barWidth) / 2;
    context.fillRect(x, center - barHeight / 2, barWidth, barHeight);
  });
}

export default function WaveformVisualizer({
  waveformData,
  duration,
  currentTime,
  onSeek,
  height = 52,
  color = "#737373",
  progressColor = "#ff5500",
  backgroundColor = "transparent",
}: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const progressCanvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateWidth = () => setWidth(container.getBoundingClientRect().width);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const visiblePeaks = useMemo(
    () =>
      reduceWaveformPeaks(
        waveformData,
        Math.max(1, Math.floor(width / 2)),
      ),
    [waveformData, width],
  );

  useEffect(() => {
    if (!width || !visiblePeaks.length) return;
    const ratio = window.devicePixelRatio || 1;
    if (baseCanvasRef.current) {
      drawPeaks(
        baseCanvasRef.current,
        visiblePeaks,
        width,
        height,
        ratio,
        color,
        backgroundColor,
      );
    }
    if (progressCanvasRef.current) {
      drawPeaks(
        progressCanvasRef.current,
        visiblePeaks,
        width,
        height,
        ratio,
        progressColor,
      );
    }
  }, [backgroundColor, color, height, progressColor, visiblePeaks, width]);

  const ratioFromPointer = useCallback((clientX: number) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds?.width) return 0;
    return Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
  }, []);

  const progress =
    duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;

  if (!waveformData.length) {
    return (
      <div
        className="h-full w-full animate-pulse rounded bg-zinc-800/70"
        aria-label="Waveform is processing"
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full cursor-pointer overflow-hidden"
      role="slider"
      aria-label="Seek through track"
      aria-valuemin={0}
      aria-valuemax={Math.max(0, duration)}
      aria-valuenow={Math.max(0, currentTime)}
      onMouseMove={(event) => setHoverRatio(ratioFromPointer(event.clientX))}
      onMouseLeave={() => setHoverRatio(null)}
      onClick={(event) => onSeek(ratioFromPointer(event.clientX) * duration)}
    >
      <canvas ref={baseCanvasRef} className="absolute inset-0" />
      <div
        className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: `${progress * 100}%` }}
      >
        <canvas ref={progressCanvasRef} className="absolute inset-0 max-w-none" />
      </div>
      {hoverRatio !== null && (
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-white/70"
          style={{ left: `${hoverRatio * 100}%` }}
        />
      )}
    </div>
  );
}
