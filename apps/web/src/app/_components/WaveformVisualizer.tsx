"use client"

import React, { useRef, useEffect, useState, useCallback } from 'react';

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
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState<boolean>(false);
  
  // Use refs for values that don't need to trigger re-renders
  const hoverPositionRef = useRef<number>(0);
  const renderRequestRef = useRef<number | null>(null);
  const waveformRenderedRef = useRef<boolean>(false);
  
  // Cache for common calculations
  const calculationCache = useRef<{
    canvasWidth: number;
    canvasHeight: number;
    barWidth: number;
    barSpacing: number;
    actualBarWidth: number;
    amplitudeFactor: number;
    progressX: number;
  }>({
    canvasWidth: 0,
    canvasHeight: 0,
    barWidth: 0,
    barSpacing: 0,
    actualBarWidth: 0,
    amplitudeFactor: 0,
    progressX: 0
  });

  // Draw the main waveform (only when data or playback position changes)
  const drawWaveform = useCallback(() => {
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
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Calculate playback progress
    const playbackProgress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
    const progressX = canvasWidth * playbackProgress;
    
    // Calculate bar width (no spacing)
    const totalBars = waveformData.length;
    const barWidth = canvasWidth / totalBars;
    const barSpacing = Math.max(1, barWidth * 0.2); // Dynamic spacing based on width
    const actualBarWidth = barWidth - barSpacing;
    
    // Find the effective maximum amplitude for scaling (avoid division by zero)
    // Use a slightly higher scaling factor to amplify the look
    const maxAmplitude = Math.max(...waveformData.map(val => Math.abs(val)), 1); // Ensure max is at least 1
    const amplitudeFactor = (canvasHeight * 0.7) / maxAmplitude; // Use 70% of height, adjust as needed

    // Cache these calculations for the overlay canvas
    calculationCache.current = {
      canvasWidth,
      canvasHeight,
      barWidth,
      barSpacing,
      actualBarWidth,
      amplitudeFactor,
      progressX
    };

    // Reflection constants
    const reflectionHeight = 0.3; // How tall reflections are (0-1)
    const reflectionOpacity = 0.3; // Base opacity for reflections

    // Define glow parameters
    context.shadowBlur = 5;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    
    // --- Create Gradients for Bars --- 
    const createBarGradient = (x: number, barHeight: number, isPlayed: boolean) => {
      const centerY = canvasHeight / 2;
      const topY = centerY - barHeight / 2;
      
      const gradient = context.createLinearGradient(0, topY, 0, centerY);
      
      if (isPlayed) {
        // Played section - more vibrant with highlight
        gradient.addColorStop(0, '#ff7b00'); // Orange-top
        gradient.addColorStop(0.5, progressColor); // Main color
        gradient.addColorStop(1, '#ff2d00'); // Red-bottom
        context.shadowColor = '#ff4500'; // Orange glow
      } else {
        // Unplayed section - more subtle
        gradient.addColorStop(0, '#aaa'); // Light top
        gradient.addColorStop(0.5, color); // Main color
        gradient.addColorStop(1, '#444'); // Dark bottom
        context.shadowColor = 'rgba(150, 150, 150, 0.5)'; // Subtle glow
      }
      
      return gradient;
    };
    
    // Function to draw a rounded bar
    const drawRoundedBar = (x: number, width: number, height: number, topY: number) => {
      const radius = Math.min(width / 2, 4); // Limit radius based on width, max 4px
      
      context.beginPath();
      // Top-left corner
      context.moveTo(x + radius, topY);
      // Top-right corner
      context.lineTo(x + width - radius, topY);
      context.quadraticCurveTo(x + width, topY, x + width, topY + radius);
      // Bottom-right corner
      context.lineTo(x + width, topY + height - radius);
      context.quadraticCurveTo(x + width, topY + height, x + width - radius, topY + height);
      // Bottom-left corner
      context.lineTo(x + radius, topY + height);
      context.quadraticCurveTo(x, topY + height, x, topY + height - radius);
      // Top-left corner again
      context.lineTo(x, topY + radius);
      context.quadraticCurveTo(x, topY, x + radius, topY);
      context.closePath();
      
      context.fill();
    };
    
    // Draw each bar of the waveform
    waveformData.forEach((amplitude, index) => {
      const x = index * barWidth + barSpacing / 2;
      
      // Add a subtle variation to each bar's height based on its index
      // This gives a more organic, less machine-perfect look
      const variationFactor = 1 + (Math.sin(index * 0.1) * 0.05);
      
      // Use amplified amplitude for visual height
      const rawHeight = Math.abs(amplitude) * amplitudeFactor * variationFactor;
      const barHeight = Math.max(4, rawHeight); // Ensure minimum height
      
      // Determine if this bar is before or after the playback position
      const currentX = x + actualBarWidth / 2; // Check center of the bar
      const isPlayed = currentX < progressX;
      
      // Set fill style with gradient
      context.fillStyle = createBarGradient(x, barHeight, isPlayed);
      
      // Draw the bar from the middle
      const centerY = canvasHeight / 2;
      const topY = centerY - barHeight / 2;
      
      // Draw the main bar with rounded corners
      drawRoundedBar(x, actualBarWidth, barHeight, topY);
      
      // Draw reflection (slightly narrower, beneath the bar)
      context.shadowBlur = 0; // Disable glow for reflection
      context.globalAlpha = isPlayed ? reflectionOpacity : reflectionOpacity * 0.6;
      
      // Create reflection gradient
      const reflectionGradient = context.createLinearGradient(
        0, centerY + barHeight / 2, 
        0, centerY + barHeight / 2 + barHeight * reflectionHeight
      );
      reflectionGradient.addColorStop(0, isPlayed ? progressColor : color);
      reflectionGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = reflectionGradient;
      
      // Draw the reflection with narrower width and fading height
      drawRoundedBar(
        x + actualBarWidth * 0.1, // Slightly narrower
        actualBarWidth * 0.8, 
        barHeight * reflectionHeight,
        centerY + barHeight / 2
      );
      
      // Reset opacity
      context.globalAlpha = 1;
      context.shadowBlur = isPlayed ? 5 : 3; // Restore glow for next bar
    });
    
    waveformRenderedRef.current = true;
  }, [waveformData, currentTime, duration, color, progressColor, backgroundColor, height]);
  
  // Draw hover line on the overlay canvas - this can update more frequently
  const drawHoverLine = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !isHovering) return;
    
    const context = canvas.getContext('2d');
    if (!context) return;
    
    const dpr = window.devicePixelRatio || 1;
    const { canvasWidth, canvasHeight, amplitudeFactor } = calculationCache.current;
    
    // Make sure overlay canvas is properly sized
    if (canvas.width !== canvasWidth * dpr || canvas.height !== canvasHeight * dpr) {
      canvas.width = canvasWidth * dpr;
      canvas.height = canvasHeight * dpr;
      context.scale(dpr, dpr);
    }
    
    // Clear the overlay canvas
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Get the current hover position
    const hoverPosition = hoverPositionRef.current;
    
    // Reset shadow properties
    context.shadowBlur = 0;
    context.shadowColor = 'transparent';
    
    // Create a gradient for the seek line
    const seekLineGradient = context.createLinearGradient(0, 0, 0, canvasHeight);
    seekLineGradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
    seekLineGradient.addColorStop(0.5, progressColor);
    seekLineGradient.addColorStop(1, 'rgba(255, 255, 255, 0.2)');
    
    context.strokeStyle = seekLineGradient;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(hoverPosition, 0);
    context.lineTo(hoverPosition, canvasHeight);
    context.stroke();
    
    // Add a small circle at the intersection of the line and the waveform
    const timeRatio = hoverPosition / canvasWidth;
    const dataIndex = Math.floor(timeRatio * waveformData.length);
    if (dataIndex >= 0 && dataIndex < waveformData.length) {
      const amplitude = Math.abs(waveformData[dataIndex] || 0);
      const barHeight = Math.max(4, amplitude * amplitudeFactor);
      const centerY = canvasHeight / 2;
      
      context.fillStyle = progressColor;
      context.beginPath();
      context.arc(hoverPosition, centerY, 5, 0, Math.PI * 2);
      context.fill();
    }
    
    // Cancel any pending animation frame
    if (renderRequestRef.current !== null) {
      cancelAnimationFrame(renderRequestRef.current);
      renderRequestRef.current = null;
    }
  }, [isHovering, waveformData, progressColor]);
  
  // Animation loop for hover effects
  const animateHover = useCallback(() => {
    drawHoverLine();
    renderRequestRef.current = requestAnimationFrame(animateHover);
  }, [drawHoverLine]);
  
  // Update waveform when data or playback changes
  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);
  
  // Set up and clean up hover animation
  useEffect(() => {
    if (isHovering) {
      renderRequestRef.current = requestAnimationFrame(animateHover);
    } else {
      // Clear overlay canvas when not hovering
      const canvas = overlayCanvasRef.current;
      if (canvas) {
        const context = canvas.getContext('2d');
        if (context) {
          context.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      
      // Cancel any pending animation frame
      if (renderRequestRef.current !== null) {
        cancelAnimationFrame(renderRequestRef.current);
        renderRequestRef.current = null;
      }
    }
    
    return () => {
      if (renderRequestRef.current !== null) {
        cancelAnimationFrame(renderRequestRef.current);
        renderRequestRef.current = null;
      }
    };
  }, [isHovering, animateHover]);
  
  // Handle mouse events for seeking
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const position = e.clientX - rect.left;
    
    // Update hover position directly without state change
    hoverPositionRef.current = position;
    
    // Only set isHovering to true if not already true
    if (!isHovering) {
      setIsHovering(true);
    }
  }, [isHovering]);
  
  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
  }, []);
  
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const position = e.clientX - rect.left;
    const seekPercentage = position / rect.width;
    const seekTime = seekPercentage * duration;
    
    onSeek(seekTime);
  }, [duration, onSeek]);

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
      {/* Main canvas for waveform */}
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
      
      {/* Overlay canvas for hover effects */}
      <canvas 
        ref={overlayCanvasRef}
        style={{ 
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none'
        }}
      />
    </div>
  );
};

export default WaveformVisualizer;