"use client"
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { HopeWave } from './hope-wave';
import { api } from '@/trpc/react';
import { toast } from 'sonner';
import { processWaveformData } from '@/lib/waveform-utils';
// import WavesurferPlayer from '@wavesurfer/react'
import { useWavesurfer } from '@wavesurfer/react'
import Timeline from 'wavesurfer.js/dist/plugins/timeline.esm.js'
import WavesurferPlayer from '@wavesurfer/react'


const TRACKS = [
  { id: "hope", label: "Hope" },
  { id: "dont-panic", label: "Don't Panic" },
  { id: "SolarOntheRise", label: "Solar On the Rise" },
  { id: "PollenSong", label: "Pollen Song" },
  { id: "voodoo", label: "Voodoo" },
  { id: "blackout_days", label: "Blackout Days" },
  { id: "basics", label: "Basics" }
];


const formatTime = (seconds: number) => [seconds / 60, seconds % 60].map((v) => `0${Math.floor(v)}`.slice(-2)).join(':')


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
const Wavesurf = () => {
  // const [waveformData, setWaveformData] = useState<number[]>(HopeWave.data);
  // const [isPlaying, setIsPlaying] = useState<boolean>(false);
  // const [currentTime, setCurrentTime] = useState<number>(0);
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


  ///
  const containerRef = useRef(null)
  const [urlIndex, setUrlIndex] = useState(0)

  const { wavesurfer, isPlaying, currentTime } = useWavesurfer({
    container: containerRef,
    height: 100,
    waveColor: 'rgb(200, 0, 200)',
    progressColor: 'rgb(100, 0, 100)',
    url: audioSrc,
    // @ts-ignore
    peaks: audioSrc ? [...HopeWave.data] : undefined,
    plugins: useMemo(() => [Timeline.create()], []),
  })

  const onPlayPause = useCallback(() => {
    wavesurfer && wavesurfer.playPause()
  }, [wavesurfer])



  return (
    <div className="audio-player" style={{ width: '100%', maxWidth: '800px', margin: '20px auto' }}>
      {/* <audio ref={audioRef} src={audioSrc} preload="metadata" /> */}

      <div ref={containerRef} />

      <button onClick={onPlayPause}>
        {isPlaying ? 'Pause' : 'Play'}
      </button>

    </div>
  );
};

export default Wavesurf;