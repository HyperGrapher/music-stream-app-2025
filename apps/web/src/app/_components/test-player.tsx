"use client"
import React, { useRef, useState } from 'react'

const TRACKS = [
    { id: "dont-panic", label: "Don't Panic" },
    { id: "SolarOntheRise", label: "Solar On the Rise" },
    { id: "PollenSong", label: "Pollen Song" },
    { id: "voodoo", label: "Voodoo" },
    { id: "hope", label: "Hope" },
    { id: "blackout_days", label: "Blackout Days" },
    { id: "basics", label: "Basics" }
];

const TestPlayer = () => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [selectedTrack, setSelectedTrack] = useState(TRACKS[0]!.id);

    // Express endpoint: /tracks/stream/:trackId
    const audioSrc = `http://localhost:4000/tracks/stream/${selectedTrack}`;

    return (
        <div className="bg-cyan-900 p-4 rounded-md max-w-md mx-auto mt-8">
            <div className="mb-4">
                <label htmlFor="track-select" className="text-white mr-2">Select Track:</label>
                <select
                    id="track-select"
                    value={selectedTrack}
                    onChange={e => setSelectedTrack(e.target.value)}
                    className="p-1 rounded"
                >
                    {TRACKS.map(track => (
                        <option key={track.id} value={track.id}>{track.label}</option>
                    ))}
                </select>
            </div>
            <audio
                ref={audioRef}
                controls
                className="w-full"
                src={audioSrc}
                onError={e => {
                    // Show a simple alert under the top window border
                    alert("Audio failed to load. Please reload the page.");
                    console.error("Audio error:", e);
                }}
            >
                Your browser does not support the audio element.
            </audio>
        </div>
    );
}

export default TestPlayer