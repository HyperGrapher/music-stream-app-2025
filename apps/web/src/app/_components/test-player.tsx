"use client"
import React, { useEffect, useRef, useState } from 'react'
import { authClient } from "@/lib/auth-client";
import { cn } from '@/lib/utils';

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
    const { data: session } = authClient.useSession();
    const audioRef = useRef<HTMLAudioElement>(null);
    const [selectedTrack, setSelectedTrack] = useState(TRACKS[0]!.id);
    const [audioSrc, setAudioSrc] = useState<string | undefined>(undefined); // don't pass empty string, it will break the stream

    useEffect(() => {
        if (session?.user?.id) {
            setAudioSrc(`http://localhost:4000/tracks/stream/${selectedTrack}?id=${session?.user?.id}`);
        } else {
            setTimeout(() => {
                setAudioSrc(`http://localhost:4000/tracks/stream/${selectedTrack}?id=anonymous`);
            }, 1500);
        }
    }, [session]);

    // Express endpoint: /tracks/stream/:trackId
    // const audioSrc = `http://localhost:4000/tracks/stream/${selectedTrack}?id=${session?.user?.name ?? 'anonymous'}`;

    return (
        <div className={cn("p-4 rounded-md w-2xl max-w-md mx-auto mt-8", session?.user?.id ? 'bg-cyan-900 ' : 'bg-cyan-900/50')}>
            <p className="text-white mb-4">
                Session ID: {session?.user?.id ?? 'anonymous'}
            </p>

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