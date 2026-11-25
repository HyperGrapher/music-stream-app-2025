import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Suspense } from "react";
import Link from "next/link";
import FileUpload from "@/components/upload";

export default async function FeedPage() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden pt-0 pb-[-61px]">
      <div className="absolute bottom-0 left-0 z-50 h-[1px] w-full bg-red-500"></div>
      <ScrollArea className="flex-1">
        <div className="min-w-max">
          <Suspense fallback={<div className="w-full" />}>
            <h1 className="text-center text-2xl font-bold">Feed</h1>
            <div className="mt-8 flex flex-col items-center justify-center gap-4">
              <Link href="/">Home</Link>
              <Link href="/discover">Discover</Link>
              <Link href="/p/1">Playlist</Link>
              <Link href="/Hypergraph">Hypergraph</Link>

              {/* <FileUpload /> */}
            </div>
          </Suspense>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
