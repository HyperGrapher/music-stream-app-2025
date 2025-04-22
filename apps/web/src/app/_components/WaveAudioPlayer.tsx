"use client"
import React, { useState, useRef, useEffect } from 'react';
import WaveformVisualizer from './WaveformVisualizer';
import { HopeWave } from './hope-wave';
import { api } from '@/trpc/react';
import { toast } from 'sonner';
import { processWaveformData } from '@/lib/waveform-utils';
import { cn } from '@/lib/utils';
import AnimatedBars from './AnimatedBars';
import AnimatedWaveMesh from './AnimatedWaveMesh';

const TRACKS = [
    { id: "hope", label: "Hope" },
    { id: "dont-panic", label: "Don't Panic" },
    { id: "SolarOntheRise", label: "Solar On the Rise" },
    { id: "PollenSong", label: "Pollen Song" },
    { id: "voodoo", label: "Voodoo" },
    { id: "blackout_days", label: "Blackout Days" },
    { id: "basics", label: "Basics" }
];


// Sample waveform data format
interface WaveformData {
    version: number;
    channels: number;
    sample_rate: number;
    samples_per_pixel: number;
    bits: number;
    length: number;
    data: number[];
}
const userId = 'zKWqD9Ide388Wnd1Ga16UKBDMe2CLr3h'
const WaveAudioPlayer: React.FC = () => {
    const [waveformData, setWaveformData] = useState<number[]>([]);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [duration, setDuration] = useState<number>(0);

    // Add visualization toggle state
    const [visualizationType, setVisualizationType] = useState<'bars' | 'wave' | null>(null);

    ///

    const [selectedTrack, setSelectedTrack] = useState(TRACKS[0]!.id);
    const [audioSrc, setAudioSrc] = useState<string | undefined>(undefined); // don't pass empty string, it will break the stream
    const [waveformFetchUrl, setWaveformFetchUrl] = useState<string | undefined>(undefined); // New state for waveform URL
    const [playbackToken, setPlaybackToken] = useState<string | null>(null);

    // Ref and state for dimensions of the waveform container
    const visualizerContainerRef = useRef<HTMLDivElement>(null);
    const [visualizerDimensions, setVisualizerDimensions] = useState({ width: 0, height: 0 });

    const getPlaybackTokenMutation = api.stream.getPlaybackToken.useMutation({
        onSuccess: (data) => {
            console.log('Received playback token:', data.token);
            setPlaybackToken(data.token);
            // Update audioSrc and waveformFetchUrl with the token
            const baseUrl = 'http://localhost:4000/tracks/stream';
            setAudioSrc(`${baseUrl}/${selectedTrack}?token=${data.token}`);
            setWaveformFetchUrl(`${baseUrl}/${selectedTrack}/waveform?token=${data.token}`);
        },
        onError: (error) => {
            console.error('Failed to get playback token:', error);
            setPlaybackToken(null); // Clear token on error
            setAudioSrc(undefined); // Clear audio source on error
            setWaveformFetchUrl(undefined); // Clear waveform URL on error
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

    useEffect(() => {
        setAudioSrc(undefined);
        setWaveformFetchUrl(undefined); // Clear waveform URL
        setPlaybackToken(null);

        if (userId && selectedTrack) {
            console.log(`Fetching token for track: ${selectedTrack}`);
            getPlaybackTokenMutation.mutate({ trackId: selectedTrack });
        } else {
            console.log('User not logged in or no track selected, clearing token/src.');
            toast.error("User is not logged in or no track selected, clearing token/src.");
            // Clear states if no user/track
            setAudioSrc(undefined);
            setWaveformFetchUrl(undefined);
            setPlaybackToken(null);
            // Optionally set anonymous src if desired: 
            // setAudioSrc(`http://localhost:4000/tracks/stream/${selectedTrack}?id=anonymous`);
        }
        // Dependency array includes session and selectedTrack to refetch token when either changes.
    }, [selectedTrack, userId]); // Ensure mutate is stable or handled correctly



    const audioRef = useRef<HTMLAudioElement>(null);

    // Fetch waveform data based on waveformFetchUrl
    useEffect(() => {
        const fetchWaveformData = async () => {
            if (!waveformFetchUrl) return; // Don't fetch if URL is not set

            try {
                console.log('Fetching waveform from:', waveformFetchUrl);
                const response = await fetch(waveformFetchUrl);
                if (!response.ok) { // Check if response status is OK (2xx)
                    throw new Error(`HTTP error! status: ${response.status} - ${await response.text()}`);
                }
                const resp = await response.json();
                const waveArr = processWaveformData(resp)
                console.log(waveArr);
                setWaveformData(waveArr);
            } catch (error) {
                console.error('Failed to fetch waveform data:', error);
                // Clear waveform data on error?
                // setWaveformData([]); 
            }
        };

        fetchWaveformData();

    }, [waveformFetchUrl]); // Dependency is now only the URL

    // Get dimensions of the visualizer container
    useEffect(() => {
        const container = visualizerContainerRef.current;
        if (!container) return;

        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                setVisualizerDimensions({ width, height });
            }
        });

        resizeObserver.observe(container);

        // Initial size
        const { width, height } = container.getBoundingClientRect();
        setVisualizerDimensions({ width, height });

        return () => resizeObserver.disconnect();
    }, []);

    // Update current time during playback
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleTimeUpdate = () => {
            setCurrentTime(audio.currentTime);
        };

        const handleDurationChange = () => {
            setDuration(audio.duration);
        };

        const handleEnded = () => {
            setIsPlaying(false);
            setCurrentTime(0);
        };

        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('durationchange', handleDurationChange);
        audio.addEventListener('ended', handleEnded);

        return () => {
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('durationchange', handleDurationChange);
            audio.removeEventListener('ended', handleEnded);
        };
    }, []); // Empty dependency array means this runs once on mount

    // Handle play/pause
    const togglePlayPause = () => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
        } else {
            audio.play();
        }
        setIsPlaying(!isPlaying);
    };

    // Handle seeking
    const handleSeek = (seekTime: number) => {
        const audio = audioRef.current;
        if (!audio) return;

        audio.currentTime = seekTime;
        setCurrentTime(seekTime);
    };

    // Format time display (e.g., 3:45)
    const formatTime = (timeInSeconds: number) => {
        const minutes = Math.floor(timeInSeconds / 60);
        const seconds = Math.floor(timeInSeconds % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    return (
        <div className="audio-player" style={{ width: '100%', maxWidth: '800px', margin: '20px auto' }}>
            <audio ref={audioRef} src={audioSrc} preload="metadata" />

            <div className={cn("p-4 rounded-md w-2xl h-[170px] max-w-md mx-auto", userId ? 'bg-zinc-900 ' : 'bg-cyan-900/50')}>
                <p className="text-white mb-4">
                    User ID: {userId ?? 'anonymous'}
                </p>
                <p className="text-white mb-4 text-[9px] break-all h-12 px-2 py-1 bg-zinc-900/50">
                    <span className='select-none text-slate-400'> Token: </span>  {playbackToken ?? 'none'} {getPlaybackTokenMutation.isPending ? '(loading...)' : ''}
                </p>

                <div className="mb-4 ">
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

                {/* Add visualization toggle */}
                <div className="mb-4">
                    <label className="text-white mr-2">Visualization:</label>
                    <div className="inline-flex rounded-md overflow-hidden">
                        <button
                            className={cn("px-3 py-1 text-sm",
                                visualizationType === 'bars'
                                    ? "bg-orange-500 text-white"
                                    : "bg-gray-700 text-gray-200"
                            )}
                            onClick={() => setVisualizationType('bars')}
                        >
                            Bars
                        </button>
                        <button
                            className={cn("px-3 py-1 text-sm",
                                visualizationType === 'wave'
                                    ? "bg-cyan-500 text-white"
                                    : "bg-gray-700 text-gray-200"
                            )}
                            onClick={() => setVisualizationType('wave')}
                        >
                            Wave
                        </button>
                    </div>
                </div>

            </div>

            <div className="player-controls" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                <button
                    onClick={togglePlayPause}
                    style={{
                        backgroundColor: '#f50',
                        border: 'none',
                        borderRadius: '50%',
                        width: '40px',
                        height: '40px',
                        color: 'white',
                        cursor: 'pointer',
                        marginRight: '15px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    {isPlaying ? '❚❚' : '▶'}
                </button>

                <div style={{ color: '#333', fontSize: '14px' }}>
                    {formatTime(currentTime)} / {formatTime(duration)}
                </div>
            </div>

            {/* Container for both visualizers */}
            <section
                className='hidden'
                ref={visualizerContainerRef}
                style={{
                    position: 'relative',
                    width: '100%',
                    height: '80px' /* Match WaveformVisualizer height */
                }}
            >
                {/* WebGL Background - Renders only if dimensions are valid */}
                {visualizationType === 'bars' && waveformData.length > 0 && (
                    <AnimatedBars
                        waveformData={waveformData}
                        isPlaying={isPlaying}
                        width={visualizerDimensions.width}
                        height={visualizerDimensions.height}
                        color="#ff9900"
                        barCount={200}
                    />
                )}

                {/* AnimatedWaveMesh Background - Alternative visualization */}
                {visualizationType === 'wave' && waveformData.length > 0 && (
                    <AnimatedWaveMesh
                        waveformData={waveformData}
                        isPlaying={isPlaying}
                        width={visualizerDimensions.width}
                        height={visualizerDimensions.height}
                        color="#00ccff"
                        secondaryColor="#ff3366"
                    />
                )}

            </section>

            {/* Existing 2D Waveform Visualizer */}
            <WaveformVisualizer
                waveformData={waveformData}
                duration={duration}
                currentTime={currentTime}
                onSeek={handleSeek}
                height={80}
                color="#CCCCCC"
                progressColor="#f50"
                backgroundColor="#ffffff00" // Keep it transparent
            />

            <div className="track-info" style={{ marginTop: '10px' }}>
                <h3 style={{ margin: '0', fontSize: '16px' }}>Track Title</h3>
                <p style={{ margin: '0', fontSize: '14px', color: '#999' }}>Artist Name</p>
            </div>
        </div>
    );
};

export default WaveAudioPlayer;