import { formatDistanceToNow } from "date-fns";
import { CalendarDays, MapPin, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { ReactNode } from "react";

import { CopyLinkButton } from "@/components/CopyLinkButton";
import { FollowButton } from "@/components/FollowButton";
import { ProfileMenu } from "@/components/ProfileMenu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { api } from "@/trpc/server";

const TABS = [
  { key: "all", label: "All", path: "" },
  { key: "popular-tracks", label: "Popular tracks", path: "/popular-tracks" },
  { key: "tracks", label: "Tracks", path: "/tracks" },
  { key: "albums", label: "Albums", path: "/albums" },
  { key: "sets", label: "Playlists", path: "/sets" },
  { key: "reposts", label: "Reposts", path: "/reposts" },
  { key: "likes", label: "Likes", path: "/likes" },
] as const;
export type ProfileTabKey = (typeof TABS)[number]["key"] | "followers" | "following";

const formatCount = (value: number) =>
  new Intl.NumberFormat("en", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);

export async function profileMetadata(username: string, tabLabel?: string): Promise<Metadata> {
  const result = await api.profiles.byUsername({ username }).catch(() => ({ status: "missing" as const }));
  if (result.status !== "ok") return { title: "Creator not found" };
  const { profile } = result;
  return {
    title: `${tabLabel ? `${tabLabel} - ` : ""}${profile.name} | Music Stream`,
    description: profile.bio?.slice(0, 150) ?? `Listen to tracks and releases from ${profile.name}.`,
    alternates: { canonical: `/${profile.username}` },
    // PR-6: profiles without public content are not indexed.
    robots: profile.publicTrackCount === 0 ? { index: false, follow: true } : undefined,
  };
}

/** Header, tab bar and sidebar of every profile page (PRD 9.1); `children` is the tab content. */
export async function ProfileShell({ username, active, children }: { username: string; active: ProfileTabKey; children: ReactNode }) {
  const result = await api.profiles.byUsername({ username });
  if (result.status === "missing") notFound();
  if (result.status === "redirect") permanentRedirect(`${result.to}${active === "all" ? "" : `/${active}`}`);
  const { profile } = result;
  const relationship = await api.profiles.relationship({ username });
  const base = `/${profile.username}`;

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-24 text-white">
      <div className="mx-auto max-w-[1240px] border-x border-zinc-900 bg-[#101010]">
        <section className="relative h-[250px] overflow-hidden bg-[radial-gradient(circle_at_72%_36%,#7c2d12_0%,#292524_32%,#09090b_74%)] sm:h-[290px]">
          {profile.bannerUrl && (
            <img src={profile.bannerUrl} srcSet={profile.bannerSrcSet ?? undefined} sizes="(min-width: 1240px) 1240px, 100vw" alt="" className="absolute inset-0 h-full w-full object-cover opacity-65" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/15 to-black/25" />
          <div className="absolute inset-x-5 bottom-6 flex items-end gap-5 sm:inset-x-8 sm:bottom-8 sm:gap-7">
            <Avatar className="h-28 w-28 shrink-0 border-4 border-black/30 shadow-2xl sm:h-40 sm:w-40">
              <AvatarImage src={profile.image ?? ""} alt={profile.name} />
              <AvatarFallback className="bg-zinc-800 text-4xl font-bold">{profile.name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="mb-1 min-w-0">
              <h1 className="inline bg-black/80 decoration-clone px-3 py-1 text-2xl leading-[1.55] font-bold sm:text-4xl">
                {profile.name}
                {profile.verified && <span title="Verified" aria-label="Verified" className="ml-2 text-orange-400">✓</span>}
                {profile.plan === "PRO" && <span className="ml-2 rounded bg-orange-700 px-1.5 py-0.5 align-middle text-xs font-bold text-white">PRO</span>}
              </h1>
              <div className="mt-2 flex flex-wrap gap-2 text-sm text-zinc-300">
                <span className="bg-black/70 px-2 py-1">@{profile.username}</span>
                {profile.city && (
                  <span className="inline-flex items-center gap-1 bg-black/70 px-2 py-1">
                    <MapPin className="h-3.5 w-3.5" /> {profile.city}
                    {profile.countryCode ? `, ${profile.countryCode}` : ""}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 bg-black/70 px-2 py-1">
                  <CalendarDays className="h-3.5 w-3.5" /> Joined {formatDistanceToNow(new Date(profile.createdAt), { addSuffix: true })}
                </span>
              </div>
            </div>
          </div>
        </section>

        <div className="flex min-h-14 flex-wrap items-center justify-between gap-4 border-b border-zinc-800 px-5 sm:px-7">
          <nav aria-label="Profile sections" className="flex gap-5 overflow-x-auto sm:gap-7">
            {TABS.map((tab) => (
              <Link
                key={tab.key}
                href={`${base}${tab.path}`}
                aria-current={active === tab.key ? "page" : undefined}
                className={`flex h-14 items-center border-b-2 px-1 text-sm font-semibold whitespace-nowrap ${active === tab.key ? "border-orange-500 text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 py-2">
            {profile.isOwner ? (
              <Button asChild variant="outline" size="sm" className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800">
                <Link href="/settings/profile">
                  <Pencil className="h-4 w-4" /> Edit profile
                </Link>
              </Button>
            ) : (
              <FollowButton userId={profile.id} initialFollowing={relationship.following} />
            )}
            <CopyLinkButton path={base} />
            {!profile.isOwner && <ProfileMenu userId={profile.id} name={profile.name} />}
          </div>
        </div>

        <div className="grid gap-8 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_290px] lg:px-7">
          <main className="min-w-0">{children}</main>
          <aside className="space-y-7 border-t border-zinc-800 pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-7">
            <div className="grid grid-cols-3 divide-x divide-zinc-800">
              <Link href={`${base}/followers`} className="hover:text-orange-400">
                <p className="text-xs text-zinc-400">Followers</p>
                <p className="mt-1 text-xl font-bold" data-testid="follower-count">{formatCount(profile.followerCount)}</p>
              </Link>
              <Link href={`${base}/following`} className="pl-4 hover:text-orange-400">
                <p className="text-xs text-zinc-400">Following</p>
                <p className="mt-1 text-xl font-bold">{formatCount(profile.followingCount)}</p>
              </Link>
              <Link href={`${base}/tracks`} className="pl-4 hover:text-orange-400">
                <p className="text-xs text-zinc-400">Tracks</p>
                <p className="mt-1 text-xl font-bold">{formatCount(profile.publicTrackCount)}</p>
              </Link>
            </div>
            {profile.bio && <p className="text-sm leading-6 break-words whitespace-pre-line text-zinc-300">{profile.bio}</p>}
            {profile.links.length > 0 && (
              <ul className="space-y-2 text-sm">
                {profile.links.map((link) => (
                  <li key={link.id}>
                    <a href={link.url} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-zinc-400 hover:text-orange-400">
                      {link.title ?? link.url.replace(/^https?:\/\//, "")}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
