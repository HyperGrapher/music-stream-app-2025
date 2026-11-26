"use client";

import { hardNavigate } from "@/lib/navigate";
import { Check, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";

import { ImageUploader } from "@/components/ImageUploader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { GENRES } from "@/lib/genres";
import { normalizeUsername } from "@/lib/names";
import { cn } from "@/lib/utils";
import { usePlayerStore } from "@/store/player";
import { api } from "@/trpc/react";

const field = "border-zinc-700 bg-zinc-900 text-white";
const STEPS = ["Profile", "Genres", "Follow"] as const;

function useDebounced<T>(value: T, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** The three onboarding steps (PRD 6.2): profile basics, at least 3 genres, follow suggested creators. */
export function OnboardingForm({ initialUsername, initialName, initialImage }: { initialUsername: string; initialName: string; initialImage: string | null }) {
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState(initialUsername);
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState<{ id: string; preview: string } | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [follow, setFollow] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const debouncedName = useDebounced(username);
  const availability = api.account.checkUsername.useQuery({ username: debouncedName }, { enabled: normalizeUsername(debouncedName).length > 0 });
  const stale = debouncedName !== username;
  const suggestions = api.account.onboardingSuggestions.useQuery({ genres: genres }, { enabled: step === 2 });
  const complete = api.account.completeOnboarding.useMutation();
  const player = usePlayerStore();

  const usernameOk = !stale && availability.data?.available === true;
  const toggleGenre = (value: string) =>
    setGenres((current) => (current.includes(value) ? current.filter((g) => g !== value) : [...current, value]));

  const finish = async () => {
    setSaving(true);
    try {
      await complete.mutateAsync({
        username,
        name,
        avatarAssetId: avatar?.id,
        genres: genres,
        follow: [...follow],
      });
      // Refresh the cached session (it carries onboardedAt) before the full reload.
      await authClient.getSession({ query: { disableCookieCache: true } });
      hardNavigate("/");
    } catch (error) {
      setSaving(false);
      toast.error(error instanceof Error ? friendlyError(error, "Could not finish setting up your profile") : "Could not finish setting up your profile");
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 text-white">
      <ol className="mb-8 flex gap-2 text-sm" aria-label="Progress">
        {STEPS.map((label, index) => (
          <li key={label} aria-current={index === step ? "step" : undefined} className={cn("flex-1 border-b-2 pb-2", index <= step ? "border-orange-500 text-white" : "border-zinc-800 text-zinc-500")}>
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="space-y-5">
          <h1 className="text-2xl font-bold">Set up your profile</h1>
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={avatar?.preview ?? initialImage ?? ""} alt="" />
              <AvatarFallback>{name.charAt(0).toUpperCase() || "U"}</AvatarFallback>
            </Avatar>
            <ImageUploader purpose="AVATAR" label="Upload avatar" onUploaded={(id, preview) => setAvatar({ id, preview })} />
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-300">Display name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} className={field} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-300">Username</span>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={25} autoComplete="off" aria-describedby="username-status" className={field} />
            <span id="username-status" className="mt-1 block min-h-5 text-xs" aria-live="polite">
              {stale || availability.isFetching ? (
                <span className="text-zinc-500">Checking...</span>
              ) : availability.data?.available ? (
                <span className="text-green-400">music-stream.app/{availability.data.username} is yours</span>
              ) : availability.data ? (
                <span className="text-red-400">
                  {availability.data.reason === "TAKEN" ? "That username is taken." : availability.data.reason === "RESERVED" ? "That username is reserved." : "Use 3-25 letters, numbers, - or _."}{" "}
                  {availability.data.suggestions.map((s) => (
                    <button key={s} type="button" className="mr-2 underline" onClick={() => setUsername(s)}>
                      {s}
                    </button>
                  ))}
                </span>
              ) : null}
            </span>
          </label>
          <Button disabled={!usernameOk || name.trim().length === 0} onClick={() => setStep(1)} className="bg-orange-500 text-white hover:bg-orange-600">
            Continue
          </Button>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-5">
          <h1 className="text-2xl font-bold">What do you listen to?</h1>
          <p className="text-sm text-zinc-400">Pick at least 3. We use them to suggest music and creators.</p>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((genre) => (
              <button
                key={genre.value}
                type="button"
                aria-pressed={genres.includes(genre.value)}
                onClick={() => toggleGenre(genre.value)}
                className={cn("rounded-full border px-3 py-1.5 text-sm transition", genres.includes(genre.value) ? "border-orange-500 bg-orange-500/15 text-orange-300" : "border-zinc-700 text-zinc-300 hover:border-zinc-500")}
              >
                {genre.label}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setStep(0)} className="text-zinc-300 hover:bg-zinc-800">
              Back
            </Button>
            <Button disabled={genres.length < 3} onClick={() => setStep(2)} className="bg-orange-500 text-white hover:bg-orange-600">
              Continue ({genres.length}/3)
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-5">
          <h1 className="text-2xl font-bold">Follow some creators</h1>
          <p className="text-sm text-zinc-400">Their new tracks will show up in your feed. You can skip this.</p>
          {suggestions.isLoading ? (
            <p className="text-sm text-zinc-500">Finding creators...</p>
          ) : (suggestions.data ?? []).length === 0 ? (
            <p className="text-sm text-zinc-500">No suggestions yet. You can find creators on Discover.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {suggestions.data?.map((creator) => {
                const on = follow.has(creator.id);
                return (
                  <li key={creator.id} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={creator.image ?? ""} alt="" />
                      <AvatarFallback>{creator.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{creator.name}</p>
                      <p className="text-xs text-zinc-500">{creator.followerCount} followers</p>
                    </div>
                    {creator.topTrack && (
                      <button
                        type="button"
                        aria-label={`Play ${creator.topTrack.title}`}
                        className="rounded-full border border-zinc-700 p-2 text-zinc-300 hover:border-orange-500 hover:text-orange-400"
                        onClick={() => {
                          player.playContext([creator.topTrack!], creator.topTrack!, { source: "OTHER" });
                        }}
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                      </button>
                    )}
                    <Button
                      size="sm"
                      aria-pressed={on}
                      variant={on ? "outline" : "default"}
                      onClick={() => setFollow((current) => { const next = new Set(current); if (on) next.delete(creator.id); else next.add(creator.id); return next; })}
                      className={on ? "border-zinc-600 bg-transparent text-white" : "bg-white text-black hover:bg-zinc-200"}
                    >
                      {on ? <><Check className="h-3.5 w-3.5" /> Following</> : "Follow"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setStep(1)} className="text-zinc-300 hover:bg-zinc-800">
              Back
            </Button>
            <Button disabled={saving} onClick={() => void finish()} className="bg-orange-500 text-white hover:bg-orange-600">
              {saving ? "Saving..." : follow.size > 0 ? "Finish" : "Skip and finish"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
