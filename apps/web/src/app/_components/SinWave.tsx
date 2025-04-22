"use client"
import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface SinWaveProps {
    waveformData: number[];
    isPlaying: boolean;
    width: number;
    height: number;
    color?: string;
    secondaryColor?: string;
}

const WaveMesh: React.FC<Omit<SinWaveProps, 'width' | 'height'> & { canvasWidth: number, canvasHeight: number }> = ({
    waveformData,
    isPlaying,
    canvasWidth,
    canvasHeight,
    color = '#f50',
    secondaryColor = '#00ccff'
}) => {
    // References
    const meshRef = useRef<THREE.Mesh>(null);
    const materialRef = useRef<THREE.ShaderMaterial>(null);
    
    // Wave parameters
    const waveParams = useRef({
        time: 0,
        amplitude: 0.1,
        frequency: 0.5,
        speed: 0.5
    });
    
    // Create custom shader material with uniforms
    const shaderData = useMemo(() => {
        // Vertex shader - responsible for wave movement
        const vertexShader = `
            uniform float uTime;
            uniform float uAmplitude;
            uniform float uFrequency;
            uniform float uSpeed;
            uniform sampler2D uNoiseTex;
            
            varying vec2 vUv;
            varying float vElevation;
            
            // Function to get amplitude at specific position based on waveform data
            float getWaveformAmplitude(float x) {
                return sin(x * uFrequency + uTime * uSpeed) * uAmplitude;
            }
            
            void main() {
                vUv = uv;
                
                // Calculate wave effect
                float elevation = getWaveformAmplitude(position.x);
                
                // Add a second, smaller wave for complexity
                elevation += getWaveformAmplitude(position.x * 2.0) * 0.5;
                
                // Store for fragment shader
                vElevation = elevation;
                
                // Apply elevation to vertex
                vec3 newPosition = position;
                newPosition.z += elevation;
                
                // Final position calculation
                gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
            }
        `;
        
        // Fragment shader - responsible for coloring
        const fragmentShader = `
            uniform vec3 uColor;
            uniform vec3 uSecondaryColor;
            uniform float uTime;
            uniform float uAmplitude;
            
            varying vec2 vUv;
            varying float vElevation;
            
            void main() {
                // Gradient based on elevation
                float colorMix = (vElevation + uAmplitude) / (2.0 * uAmplitude);
                
                // Add some noise for texture
                float noise = fract(sin(vUv.x * 100.0 + vUv.y * 100.0 + uTime) * 10000.0);
                
                // Mix colors based on elevation and add subtle noise
                vec3 color = mix(uColor, uSecondaryColor, colorMix + noise * 0.05);
                
                // Add shine effect on peaks
                float shine = smoothstep(0.7, 1.0, colorMix);
                color += shine * 0.2;
                
                gl_FragColor = vec4(color, 0.8); // Slightly transparent
            }
        `;
        
        // Return materials with uniforms
        return {
            vertexShader,
            fragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uAmplitude: { value: 0.2 },
                uFrequency: { value: 3.0 },
                uSpeed: { value: 0.5 },
                uColor: { value: new THREE.Color(color) },
                uSecondaryColor: { value: new THREE.Color(secondaryColor) }
            }
        };
    }, [color, secondaryColor]);
    
    // Create a plane geometry with many segments for smoother waves
    const geometry = useMemo(() => {
        return new THREE.PlaneGeometry(canvasWidth * 0.01, canvasHeight * 0.01, 128, 1);
    }, [canvasWidth, canvasHeight]);
    
    // Animation frame
    useFrame(({ clock }: { clock: THREE.Clock }) => {
        if (!materialRef.current) return;
        
        const elapsedTime = clock.getElapsedTime();
        const uniforms = materialRef.current.uniforms as {
            uTime: { value: number };
            uAmplitude: { value: number };
            uFrequency: { value: number };
            uSpeed: { value: number };
            uColor: { value: THREE.Color };
            uSecondaryColor: { value: THREE.Color };
        };
        
        // Set time uniform for animation
        uniforms.uTime.value = elapsedTime;
        
        // Calculate amplitude based on waveform data
        if (isPlaying && waveformData.length > 0) {
            // Get average amplitude from waveform to modulate wave height
            const maxAmp = Math.max(...waveformData.map(v => Math.abs(v)), 0.01);
            const avgAmp = waveformData.reduce((sum, v) => sum + Math.abs(v), 0) / waveformData.length;
            
            // Smoothly transition to target amplitude
            waveParams.current.amplitude += (avgAmp * 0.6 - waveParams.current.amplitude) * 0.05;
            waveParams.current.frequency += ((maxAmp * 2.0 + 1.0) - waveParams.current.frequency) * 0.05;
            waveParams.current.speed = 0.3 + avgAmp * 2.0;
        } else {
            // When not playing, gradually reduce animation
            waveParams.current.amplitude *= 0.98;
            waveParams.current.speed *= 0.98;
        }
        
        // Update uniforms
        uniforms.uAmplitude.value = waveParams.current.amplitude;
        uniforms.uFrequency.value = waveParams.current.frequency;
        uniforms.uSpeed.value = waveParams.current.speed;
        
        // Optional: rotate the mesh slightly for more dynamic effect
        if (meshRef.current) {
            meshRef.current.rotation.x = Math.sin(elapsedTime * 0.2) * 0.1 - 0.2; // Slight tilt
        }
    });
    
    return (
        <mesh 
            ref={meshRef} 
            position={[0, 0, 0]} 
            rotation={[0, 0, 0]}
        >
            <primitive object={geometry} attach="geometry" />
            <shaderMaterial 
                ref={materialRef}
                vertexShader={shaderData.vertexShader}
                fragmentShader={shaderData.fragmentShader}
                uniforms={shaderData.uniforms}
                transparent={true}
                side={THREE.DoubleSide}
            />
        </mesh>
    );
};

const SinWave: React.FC<SinWaveProps> = ({ width, height, ...props }) => {
    if (width <= 0 || height <= 0) return null;
    
    return (
        <Canvas 
            orthographic
            camera={{ 
                zoom: 50, 
                position: [0, 0, 5], 
                near: 0.1, 
                far: 100 
            }}
            style={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                width: '100%', 
                height: '100%', 
                zIndex: -1,
                pointerEvents: 'none'
            }}
        >
            <ambientLight intensity={0.8} />
            <directionalLight position={[0, 5, 5]} intensity={1} />
            <WaveMesh {...props} canvasWidth={width} canvasHeight={height} />
        </Canvas>
    );
};

export default SinWave;
