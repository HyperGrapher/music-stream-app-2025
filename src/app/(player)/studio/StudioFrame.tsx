import { StudioNav } from "./StudioNav";

/** Container + tabs of the Studio table pages (Tracks, Albums & playlists, Insights). */
export function StudioFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 pb-32 text-white">
      <StudioNav />
      <div className="mt-6">{children}</div>
    </div>
  );
}
