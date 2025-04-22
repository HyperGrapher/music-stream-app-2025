"use client"
import React, { useState, useRef, useEffect } from 'react';
import WaveformVisualizer from './WaveformVisualizer';
import { HopeWave } from './hope-wave';
import { api } from '@/trpc/react';
import { toast } from 'sonner';
import { processWaveformData } from '@/lib/waveform-utils';


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

  ///

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


  
  const audioRef = useRef<HTMLAudioElement>(null);

  // Fetch waveform data
  useEffect(() => {
    // This would typically come from your API
    const sampleData: WaveformData = HopeWave
    
    // Use the waveform data
    setWaveformData(sampleData.data);
    
    // In a real app, you would fetch this data:
    /*
    const fetchWaveformData = async () => {
      try {
        const response = await fetch(`https://api.yourdomain.com/waveform?track=${trackId}`);
        const data = await response.json();
        setWaveformData(data.data);
      } catch (error) {
        console.error('Failed to fetch waveform data:', error);
      }
    };
    
    fetchWaveformData();
    */
  }, [audioSrc]);

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
  }, []);

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
      
      <WaveformVisualizer
        waveformData={waveformData}
        duration={duration}
        currentTime={currentTime}
        onSeek={handleSeek}
        height={80}
        color="#CCCCCC"
        progressColor="#f50"
        backgroundColor="#ff0000"
      />
      
      <div className="track-info" style={{ marginTop: '10px' }}>
        <h3 style={{ margin: '0', fontSize: '16px' }}>Track Title</h3>
        <p style={{ margin: '0', fontSize: '14px', color: '#999' }}>Artist Name</p>
      </div>
    </div>
  );
};

export default WaveAudioPlayer;