import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Suspense } from 'react';
import Link from 'next/link';
import { api } from "@/trpc/server";


export default async function FeedPage() {
    const a = await api.post.getLatest();


    return (
        <div className="flex-1 flex flex-col overflow-hidden pb-[69px] pt-2 relative h-[calc(100vh-69px)]">
            <div className="h-[1px] bg-red-500/20 w-full absolute bottom-0 left-0 z-50"></div>
            <ScrollArea className="flex-1">
                <div className="min-w-max">
                <Suspense fallback={<div className="w-full" />}>
                    <h1 className="text-2xl font-bold text-center">Feed</h1>
                    <div className="flex flex-col gap-4 justify-center items-center mt-8">
                        <Link href="/">Home</Link>
                        <Link href="/discover">Discover</Link>
                        <Link href="/p/1">Playlist</Link>

                        <pre>{JSON.stringify(a, null, 2)}</pre>
                    </div>
                </Suspense>
            </div>
            <ScrollBar orientation="horizontal" />
        </ScrollArea>
    </div>
    );
}
