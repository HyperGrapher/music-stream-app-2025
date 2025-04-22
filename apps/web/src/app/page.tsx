import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { TrackTable } from './p/[id]/track-table';
import { Suspense } from 'react';

async function Tracks({
  searchParams,
}: {
  searchParams: Promise<{ q: string }>;
}) {
  const query = (await searchParams).q;
  const songs = [
    {
      id: '1',
      title: 'Song 1',
      duration: 100,
      artworkUrl: 'https://placehold.co/600x400',
      userId: '1',
      albumId: '1',
      genre: 'Pop',
      bpm: 120,
      key: 'C',
      tags: ['Pop', 'Dance'],
      releaseDate: '2021-01-01',
    },
    {
      id: '2',
      title: 'Song 2',
      duration: 100,
      artworkUrl: 'https://placehold.co/600x400',
      userId: '2',
      albumId: '2',
      genre: 'Rock',
      bpm: 120,
      key: 'C',
      tags: ['Rock', 'Dance'],
      releaseDate: '2021-01-01',
    },
  ];
  // @ts-ignore
  return <TrackTable query={query} playlist={{ songs }} />;
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ q: string }>;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0A0A0A] pb-[69px] pt-2">
      <ScrollArea className="flex-1">
        <div className="min-w-max">
          <Suspense fallback={<div className="w-full" />}>
            <Tracks searchParams={searchParams} />
          </Suspense>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
