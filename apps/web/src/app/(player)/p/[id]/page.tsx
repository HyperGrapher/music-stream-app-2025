import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { ChevronLeft, ChevronRight, Shuffle } from 'lucide-react';
import { TrackTable } from './track-table';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { formatDuration } from '@/lib/utils';
import { CoverImage } from './cover-image';
import { EditableTitle } from './editable-title';


async function getPlaylistWithSongs(id: string) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return {
    id: '1',
    name: 'Playlist 1',
    coverUrl: 'https://placehold.co/600x400',
    trackCount: 2,
    duration: 100,
    songs: [
      {
        id: '1',
        title: 'Song playlist 1',
        duration: 100,
        artworkUrl: 'https://placehold.co/600x400',
        userId: '1',
        genre: 'Pop',
        bpm: 120,
        key: 'C',
        tags: ['Pop', 'Dance'],
        releaseDate: '2021-01-01',
      },
      {
        id: '2',
        title: 'Song playlist 2',
        duration: 100,
        artworkUrl: 'https://placehold.co/600x400',
        userId: '2',
        genre: 'Rock',
        bpm: 120,
        key: 'C',
        tags: ['Rock', 'Dance'],
        releaseDate: '2021-01-01',
      },
    ],
  };
}

export default async function PlaylistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let id = (await params).id;
  let playlist = await getPlaylistWithSongs(id);

  if (!playlist) {
    notFound();
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden  pb-[69px]">
      <div className="flex items-center justify-between p-3 ">
        <div className="flex items-center space-x-8">
          <Link href="/" passHref>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </Link>

          <span className="text-sm">{playlist.name}</span>

          <div className="flex items-center space-x-8">
            <Link href="/feed" passHref>
              Feed
            </Link>
            <Link href="/discover" passHref>
              Discover
            </Link>
          </div>
        </div>

      </div>

      <div className="flex items-center py-3 px-4 space-x-3 ">
        <CoverImage url={playlist.coverUrl} playlistId={playlist.id} />
        <div>
          <EditableTitle playlistId={playlist.id} initialName={playlist.name} />
          <p className="text-xs sm:text-sm text-gray-400">
            {playlist.trackCount} tracks • {formatDuration(playlist.duration)}
          </p>
        </div>
      </div>

      <ScrollArea className="flex-1 mt-3">
        <div className="min-w-max">
          <TrackTable playlist={playlist} />
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
