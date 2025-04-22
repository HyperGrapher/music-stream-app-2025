"use client"

import React, { useRef, useEffect, useState } from 'react';

interface WaveformProps {
  waveformData: number[];
  duration: number; // Audio duration in seconds
  currentTime: number; // Current playback position in seconds
  onSeek: (position: number) => void; // Callback when user seeks
  height?: number;
  color?: string;
  progressColor?: string;
  backgroundColor?: string;
}

const WaveformVisualizer: React.FC<WaveformProps> = ({
  waveformData,
  duration,
  currentTime,
  onSeek,
  height = 100,
  color = '#999999',
  progressColor = '#f50',
  backgroundColor = '#ddd'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const [hoverPosition, setHoverPosition] = useState<number>(0);

  // Draw the waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData || waveformData.length === 0) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const dpr = window.devicePixelRatio || 1;
    const canvasWidth = canvas.clientWidth;
    const canvasHeight = canvas.clientHeight;
    
    // Set canvas dimensions accounting for device pixel ratio
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    context.scale(dpr, dpr);
    
    // Clear canvas
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Calculate playback progress
    const playbackProgress = Math.min(currentTime / duration, 1);
    const progressWidth = canvasWidth * playbackProgress;
    
    // Calculate bar width and spacing
    const barWidth = Math.max(1, canvasWidth / waveformData.length - 1);
    const barSpacing = 1;
    
    // Normalize the waveform data to fit canvas height
    const maxAmplitude = Math.max(...waveformData.map(val => Math.abs(val)));
    const amplitudeFactor = (canvasHeight / 2) / (maxAmplitude * 0.5 || 1);
    
    // Draw each bar of the waveform
    waveformData.forEach((amplitude, index) => {
      const x = index * (barWidth + barSpacing);
      const barHeight = Math.abs(amplitude) * amplitudeFactor;
      
      // Determine if this bar is before or after the playback position
      context.fillStyle = x < progressWidth ? progressColor : color;
      
      // Draw from the middle (like SoundCloud)
      const y = (canvasHeight / 2) - (barHeight / 2);
      context.fillRect(x, y, barWidth, barHeight);
    });
    
    // Draw hover position line if hovering
    if (isHovering) {
      context.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(hoverPosition, 0);
      context.lineTo(hoverPosition, canvasHeight);
      context.stroke();
    }
  }, [waveformData, currentTime, duration, isHovering, hoverPosition, color, progressColor, backgroundColor]);

  // Handle mouse events for seeking
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const position = e.clientX - rect.left;
    setHoverPosition(position);
    setIsHovering(true);
  };
  
  const handleMouseLeave = () => {
    setIsHovering(false);
  };
  
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const position = e.clientX - rect.left;
    const seekPercentage = position / rect.width;
    const seekTime = seekPercentage * duration;
    
    onSeek(seekTime);
  };

  return (
    <div 
      ref={containerRef}
      style={{ 
        position: 'relative', 
        width: '100%', 
        height, 
        cursor: 'pointer',
        borderRadius: '2px',
        overflow: 'hidden'
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <canvas 
        ref={canvasRef}
        style={{ 
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%'
        }}
      />
    </div>
  );
};

export default WaveformVisualizer;