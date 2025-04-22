// utils/waveformUtils.ts

/**
 * Process waveform data from BBC audiowaveform format
 * to ensure it's suitable for visualization
 */
export const processWaveformData = (rawData: any): number[] => {
    if (!rawData || !rawData.data || !Array.isArray(rawData.data)) {
        return [];
    }

    // Extract just the data array from the full response
    const waveData = rawData.data;

    // Ensure we have enough data points for smooth visualization
    if (waveData.length < 100) {
        // Interpolate data to get more points if needed
        return interpolateWaveformData(waveData, 200);
    }

    // If there's too much data, you might want to downsample
    if (waveData.length > 2000) {
        return downsampleWaveformData(waveData, 1000);
    }

    return waveData;
};

/**
 * Interpolate waveform data to increase the number of points
 */
export const interpolateWaveformData = (data: number[], targetLength: number): number[] => {
    const result: number[] = [];
    const factor = (data.length - 1) / (targetLength - 1);

    for (let i = 0; i < targetLength; i++) {
        const exactIndex = i * factor;
        const lowerIndex = Math.floor(exactIndex);
        const upperIndex = Math.min(lowerIndex + 1, data.length - 1);
        const fraction = exactIndex - lowerIndex;

        // Linear interpolation between two adjacent points
        const value = (data[lowerIndex] ?? 0) * (1 - fraction) + (data[upperIndex] ?? 0) * fraction;
        result.push(value);
    }

    return result;
};

/**
 * Downsample waveform data to reduce the number of points
 */
export const downsampleWaveformData = (data: number[], targetLength: number): number[] => {
    const result: number[] = [];
    const factor = data.length / targetLength;

    for (let i = 0; i < targetLength; i++) {
        const start = Math.floor(i * factor);
        const end = Math.floor((i + 1) * factor);
        let sum = 0;

        // Average the points in this segment
        for (let j = start; j < end; j++) {
            sum += data[j] ?? 0;
        }

        result.push(sum / (end - start));
    }

    return result;
};

/**
 * Normalize waveform data to a certain range [-maxValue, maxValue]
 */
export const normalizeWaveformData = (data: number[], maxValue: number = 100): number[] => {
    const max = Math.max(...data.map(v => Math.abs(v)));
    if (max === 0) return data;

    const scaleFactor = maxValue / max;
    return data.map(v => v * scaleFactor);
};
