import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Suspense } from 'react';
import Link from 'next/link';

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
      artworkUrl: 'https://placehold.co/600x600',
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
      artworkUrl: 'https://placehold.co/600x600',
      userId: '2',
      albumId: '2',
      genre: 'Rock',
      bpm: 120,
      key: 'C',
      tags: ['Rock', 'Dance'],
      releaseDate: '2021-01-01',
    },
  ];

  // return <TrackTable query={query} playlist={{ songs }} />;
  return <div />;
}

export default function Page() {

  const searchParams = Promise.resolve({ q: '' })
  return (
    <div className="flex-1 flex flex-col overflow-hidden pb-[69px] pt-2">
      <ScrollArea className="flex-1">
        <div className="min-w-max">
          <Suspense fallback={<div className="w-full" />}>
            {/* <Tracks searchParams={searchParams} /> */}

            <h1 className="text-2xl font-bold text-center">Home Page</h1>
            <div className="flex flex-col gap-4 justify-center items-center mt-8">
              <Link href="/discover">Discover</Link>
              <Link href="/feed">Feed</Link>
            </div>
          </Suspense>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
