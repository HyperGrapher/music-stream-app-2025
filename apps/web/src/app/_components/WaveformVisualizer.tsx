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
    
    // Clear canvas with the background color
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Calculate playback progress
    const playbackProgress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
    const progressX = canvasWidth * playbackProgress;
    
    // Calculate bar width (no spacing)
    const barWidth = canvasWidth / waveformData.length;
    
    // Find the effective maximum amplitude for scaling (avoid division by zero)
    // Use a slightly higher scaling factor to amplify the look
    const maxAmplitude = Math.max(...waveformData.map(val => Math.abs(val)), 1); // Ensure max is at least 1
    const amplitudeFactor = (canvasHeight * 0.8) / maxAmplitude; // Use 80% of height, adjust as needed

    // --- Create Gradients --- 
    // Helper to create a vertical gradient
    const createGradient = (color: string) => {
      const gradient = context.createLinearGradient(0, 0, 0, canvasHeight);
      // Adjust gradient colors for a SoundCloud-like feel (e.g., slightly darker bottom)
      // This is an example, feel free to tweak colors
      gradient.addColorStop(0, color); // Top color
      gradient.addColorStop(1, progressColor === color ? '#c40' : '#666'); // Darker bottom based on main color
      return gradient;
    };

    const progressGradient = createGradient(progressColor);
    const baseGradient = createGradient(color);
    // ------------------------

    // Draw each bar of the waveform
    waveformData.forEach((amplitude, index) => {
      const x = index * barWidth;
      // Use amplified amplitude for visual height
      const barHeight = Math.max(1, Math.abs(amplitude) * amplitudeFactor); // Ensure minimum height of 1px
            
      // Determine if this bar is before or after the playback position
      const currentX = x + barWidth / 2; // Check center of the bar
      context.fillStyle = currentX < progressX ? progressGradient : baseGradient;
      
      // Draw from the middle, extending up and down
      const y = (canvasHeight / 2) - (barHeight / 2);
      context.fillRect(x, y, barWidth, barHeight);
    });
    
    // Draw hover position line if hovering
    if (isHovering) {
      context.strokeStyle = progressColor; // Use progress color for hover line
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(hoverPosition, 0);
      context.lineTo(hoverPosition, canvasHeight);
      context.stroke();
    }
  }, [waveformData, currentTime, duration, isHovering, hoverPosition, color, progressColor, backgroundColor, height]); // Added height to deps

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
          height: '100%',
          opacity: '1'
        }}
      />
    </div>
  );
};

export default WaveformVisualizer;