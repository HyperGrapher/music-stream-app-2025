"use client"
import React, { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils';
import { api } from "@/trpc/react";
import { toast } from "sonner"
import { useRouter } from 'next/navigation';

const TRACKS = [
    { id: "dont-panic", label: "Don't Panic" },
    { id: "SolarOntheRise", label: "Solar On the Rise" },
    { id: "PollenSong", label: "Pollen Song" },
    { id: "voodoo", label: "Voodoo" },
    { id: "hope", label: "Hope" },
    { id: "blackout_days", label: "Blackout Days" },
    { id: "basics", label: "Basics" }
];

const TestPlayer = ({ userId }: { userId: string | undefined }) => {
    const router = useRouter();
    const audioRef = useRef<HTMLAudioElement>(null);
    const [selectedTrack, setSelectedTrack] = useState(TRACKS[0]!.id);
    const [audioSrc, setAudioSrc] = useState<string | undefined>(undefined); // don't pass empty string, it will break the stream
    const [playbackToken, setPlaybackToken] = useState<string | null>(null);

    const getPlaybackTokenMutation = api.stream.getPlaybackToken.useMutation({
        onSuccess: (data) => {
            console.log('Received playback token:', data.token);
            setPlaybackToken(data.token);
            // Update audioSrc with the token
            setAudioSrc(`http://localhost:4000/tracks/stream/${selectedTrack}?token=${data.token}`);
        },
        onError: (error) => {
            console.error('Failed to get playback token:', error);
            setPlaybackToken(null); // Clear token on error
            setAudioSrc(undefined); // Clear audio source on error
            if (error.data?.code === 'UNAUTHORIZED') {
                console.log(error.message);
                toast.error("User is not authorized to get a playback token.");
                // Handle unauthorized error specifically if needed
                console.log('User is not authorized to get a playback token.');
                // Optionally, set an anonymous source or show a message
                // setAudioSrc(`http://localhost:4000/tracks/stream/${selectedTrack}?id=anonymous`);
            }
        },
    });

    // Effect to fetch playback token when track or session changes
    useEffect(() => {
        setAudioSrc(undefined);
        setPlaybackToken(null);

        if (userId && selectedTrack) {
            console.log(`Fetching token for track: ${selectedTrack}`);
            getPlaybackTokenMutation.mutate({ trackId: selectedTrack });
        } else {
            console.log('User not logged in or no track selected, clearing token/src.');
            toast.error("User is not logged in or no track selected, clearing token/src.");
            // Optionally set anonymous src if desired: 
            // setAudioSrc(`http://localhost:4000/tracks/stream/${selectedTrack}?id=anonymous`);
        }
        // Dependency array includes session and selectedTrack to refetch token when either changes.
    }, [selectedTrack, userId, getPlaybackTokenMutation.mutate]); // Ensure mutate is stable or handled correctly

    return (
        <div className={cn("p-4 rounded-md w-2xl max-w-md mx-auto mt-8", userId ? 'bg-cyan-900 ' : 'bg-cyan-900/50')}>
            <p className="text-white mb-4">
                User ID: {userId ?? 'anonymous'}
            </p>
            <p className="text-white mb-4 text-[9px] break-all">
              <span className='select-none text-slate-400'> Token: </span>  {playbackToken ?? 'none'} {getPlaybackTokenMutation.isPending ? '(loading...)' : ''}
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
                    toast.error("Audio failed to load. Please reload the page.");
                    console.error("Audio error:", e);
                    // add query param to the url called refresh=true using nextjs router   
                }}
            >
                Your browser does not support the audio element.
            </audio>
        </div>
    );
}

export default TestPlayer