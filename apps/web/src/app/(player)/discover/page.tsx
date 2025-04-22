import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Suspense } from 'react';
import Link from 'next/link';


export default function DiscoverPage() {
    return (
        <div className="flex-1 flex flex-col overflow-hidden pb-[69px] pt-2">
            <ScrollArea className="flex-1">
                <div className="min-w-max">
                    <Suspense fallback={<div className="w-full" />}>
                        <h1 className="text-2xl font-bold text-center">Home Page</h1>
                        <div className="flex flex-col gap-4 justify-center items-center mt-8">
                            <Link href="/">Home</Link>
                            <Link href="/feed">Feed</Link>
                            <Link href="/p/1">Playlist</Link>

                        </div>
                    </Suspense>
                </div>
                <ScrollBar orientation="horizontal" />
            </ScrollArea>
        </div>
    );
}
