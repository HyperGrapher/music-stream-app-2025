"use client";

import { api } from "@/trpc/react";
import { useState, useEffect } from "react";

function JsonInfo({artist}: {artist: string}) {

    const { data: trackData, isLoading } = api.artist.getLatestTracks.useQuery({
        artist,
        limit: 5,
    });

    if (isLoading) return <div>Loading...</div>;

    return (
        <div className="px-6 py-4 border-t border-zinc-800 pb-20">
            <h2 className="text-xl font-semibold mb-4">JSON Data</h2>
            <pre className="bg-zinc-900 p-4 rounded overflow-auto max-h-96 text-xs">
                {trackData ? JSON.stringify(trackData, null, 4) : "No data available"}
            </pre>
        </div>
    );
}

export default JsonInfo;