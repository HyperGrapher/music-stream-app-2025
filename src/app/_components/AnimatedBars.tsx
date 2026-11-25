"use client"
import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface WebGLBackgroundProps {
    waveformData: number[];
    isPlaying: boolean;
    width: number;
    height: number;
    barCount?: number; // Number of bars to display
    color?: string;
}

const AnimatedBars: React.FC<Omit<WebGLBackgroundProps, 'width' | 'height'> & { canvasWidth: number, canvasHeight: number }> = ({
    waveformData,
    isPlaying,
    barCount = 100, // Default number of bars
    color = '#f50', // Default color matching progress
    canvasWidth,
    canvasHeight
}) => {
    const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
    const groupRef = useRef<THREE.Group>(null);

    // Memoize bars to avoid recreating geometry/material on every render
    const bars = useMemo(() => {
        meshRefs.current = []; // Clear refs when bars are recalculated
        return Array.from({ length: barCount }).map((_, i) => {
            const mesh = new THREE.Mesh(
                new THREE.PlaneGeometry(canvasWidth / barCount * 0.8, 1), // Bar width, initial height 1
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3 })
            );
            // Position bars horizontally
            mesh.position.x = (i - barCount / 2) * (canvasWidth / barCount);
            mesh.position.y = 0; // Start at center vertical
            meshRefs.current[i] = mesh;
            return mesh;
        });
    }, [barCount, canvasWidth, color]);

    useFrame(({ clock }: { clock: THREE.Clock }) => {
        if (!isPlaying || waveformData.length === 0 || !groupRef.current) {
            // Optionally lerp scale back to 0 when not playing
             bars.forEach(bar => {
                 if (bar) {
                     bar.scale.y += (0.1 - bar.scale.y) * 0.1; // Smoothly shrink
                 }
             });
            return;
        }

        const elapsedTime = clock.getElapsedTime();
        const maxDataValue = Math.max(...waveformData.map(v => Math.abs(v)), 1); // Avoid division by zero

        bars.forEach((bar, i) => {
            if (!bar) return;

            // Map bar index to waveform data index
            const dataIndex = Math.floor((i / barCount) * waveformData.length);
            const amplitude = Math.abs(waveformData[dataIndex] || 0);

            // Normalize amplitude (0 to 1)
            const normalizedAmp = amplitude / maxDataValue;

            // Calculate target scale based on amplitude and a sine wave for smooth motion
            // Adjust frequency (e.g., 0.5) and speed (e.g., 2) as needed
            const frequency = 0.5;
            const speed = 2;
            const wave = Math.sin(i * frequency + elapsedTime * speed) * 0.5 + 0.5; // Wave between 0 and 1
            
            // Target scale influenced by normalized amplitude and wave motion
            // Use canvasHeight for scaling, ensure minimum scale
            const targetScale = Math.max(1, normalizedAmp * wave * canvasHeight * 2); // Scale factor based on height

            // Smoothly animate scale (lerp)
            bar.scale.y += (targetScale - bar.scale.y) * 0.1; // Adjust lerp factor (0.1) for smoothness
        });
    });

    return (
        <group ref={groupRef}>
            {bars.map((bar, index) => (
                <primitive key={index} object={bar} />
            ))}
        </group>
    );
};

const WebGLBackground: React.FC<WebGLBackgroundProps> = ({ width, height, ...props }) => {
    if (width <= 0 || height <= 0) {
        // Don't render canvas if dimensions are invalid
        return null; 
    }

    return (
        <Canvas 
            orthographic 
            camera={{ zoom: 1, position: [0, 0, 10], left: -width / 2, right: width / 2, top: height / 2, bottom: -height / 2, near: 0.1, far: 100 }}
            style={{ position: 'absolute', top: 0, left: 0, zIndex: -1, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
            <ambientLight intensity={3} />
            <pointLight position={[10, 10, 10]} />
            <AnimatedBars {...props} canvasWidth={width} canvasHeight={height} />
        </Canvas>
    );
};

export default WebGLBackground;
