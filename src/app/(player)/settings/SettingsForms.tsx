"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { hardNavigate } from "@/lib/navigate";
import { ImageUploader } from "@/components/ImageUploader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth-client";
import { friendlyError } from "@/lib/error-messages";
import { PASSWORD_PROBLEM_MESSAGES, passwordProblem } from "@/lib/passwords";
import { api } from "@/trpc/react";

const field = "border-zinc-700 bg-zinc-900 text-white";
const primary = "bg-orange-500 text-white hover:bg-orange-600";
const select = "h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white";

function Section({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-bold">{title}</h2>
      {description && <p className="mt-1 text-sm text-zinc-400">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

const Label = ({ text, children }: { text: string; children: React.ReactNode }) => (
  <label className="block text-sm">
    <span className="mb-1 block text-zinc-300">{text}</span>
    {children}
  </label>
);

function useMe() {
  return api.account.me.useQuery();
}

const COUNTRIES = (() => {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const codes = Array.from({ length: 26 * 26 }, (_, i) => String.fromCharCode(65 + Math.floor(i / 26), 65 + (i % 26)));
  return codes.flatMap((code) => {
    try {
      const name = names.of(code);
      return name && name !== code ? [{ code, name }] : [];
    } catch {
      return [];
    }
  }).sort((a, b) => a.name.localeCompare(b.name));
})();

// --------------------------------------------------------------------------------------------- profile (9.2)

export function ProfileSettings() {
  const { data: me } = useMe();
  if (!me) return <p className="text-sm text-zinc-500">Loading...</p>;
  return <ProfileForm key={me.id} me={me} />;
}

type Me = NonNullable<ReturnType<typeof useMe>["data"]>;

function ProfileForm({ me }: { me: Me }) {
  const router = useRouter();
  const utils = api.useUtils();
  const update = api.account.updateProfile.useMutation();
  const [name, setName] = useState(me.name);
  const [username, setUsername] = useState(me.username);
  const [bio, setBio] = useState(me.bio ?? "");
  const [city, setCity] = useState(me.city ?? "");
  const [country, setCountry] = useState(me.countryCode ?? "");
  const [links, setLinks] = useState(me.profileLinks.map((l) => ({ url: l.url, title: l.title ?? "" })));
  const [avatar, setAvatar] = useState<{ id: string; preview: string } | null>(null);
  const [banner, setBanner] = useState<{ id: string; preview: string } | null>(null);
  const renamed = username.trim().toLowerCase() !== me.username;
  const availability = api.account.checkUsername.useQuery({ username }, { enabled: renamed && username.length >= 3 });

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const result = await update.mutateAsync({
        name,
        username: renamed ? username : undefined,
        bio: bio.trim() || null,
        city: city.trim() || null,
        countryCode: country || null,
        avatarAssetId: avatar?.id,
        bannerAssetId: banner?.id,
        links: links.filter((l) => l.url.trim()).map((l) => ({ url: l.url.trim(), title: l.title.trim() || null })),
      });
      toast.success("Profile saved");
      await utils.account.me.invalidate();
      // The navbar (server component) shows the avatar and username.
      router.refresh();
      if (result.username && renamed) router.replace("/settings/profile");
    } catch (error) {
      toast.error(friendlyError(error as never, "Could not save your profile"));
    }
  };

  return (
    <form onSubmit={(event) => void save(event)} aria-label="Edit profile">
      <h1 className="mb-6 text-2xl font-bold">Profile</h1>
      <Section title="Images">
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={avatar?.preview ?? me.avatarUrl ?? ""} alt="" />
            <AvatarFallback>{me.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <ImageUploader purpose="AVATAR" label="Change avatar" onUploaded={(id, preview) => setAvatar({ id, preview })} />
        </div>
        <div className="space-y-2">
          <div className="h-28 overflow-hidden rounded-md bg-zinc-900">
            {(banner?.preview ?? me.bannerUrl) && <img src={banner?.preview ?? me.bannerUrl ?? ""} alt="" className="h-full w-full object-cover" />}
          </div>
          <ImageUploader purpose="BANNER" label="Change banner" onUploaded={(id, preview) => setBanner({ id, preview })} />
          <p className="text-xs text-zinc-500">Banners are cropped to a wide strip (2480x520 works best).</p>
        </div>
      </Section>
      <Section title="About you">
        <Label text="Display name">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} required className={field} />
        </Label>
        <Label text="Username">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={25} className={field} />
          {renamed && (
            <span className="mt-1 block text-xs text-zinc-400" aria-live="polite">
              {availability.data?.available === false ? <span className="text-red-400">Not available.</span> : "Your old link keeps redirecting to the new one for 30 days."}
            </span>
          )}
        </Label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Label text="City">
            <Input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} className={field} />
          </Label>
          <Label text="Country">
            <select value={country} onChange={(e) => setCountry(e.target.value)} className={select}>
              <option value="">-</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </Label>
        </div>
        <Label text={`Bio (${bio.length}/1000)`}>
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={1000} rows={5} className={field} />
        </Label>
      </Section>
      <Section title="Links" description="Up to 10 links shown on your profile.">
        {links.map((link, index) => (
          <div key={index} className="flex gap-2">
            <Input value={link.url} onChange={(e) => setLinks((c) => c.map((l, i) => (i === index ? { ...l, url: e.target.value } : l)))} placeholder="https://" aria-label={`Link ${index + 1} URL`} className={field} />
            <Input value={link.title} onChange={(e) => setLinks((c) => c.map((l, i) => (i === index ? { ...l, title: e.target.value } : l)))} placeholder="Title (optional)" aria-label={`Link ${index + 1} title`} className={field} />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove link ${index + 1}`} onClick={() => setLinks((c) => c.filter((_, i) => i !== index))} className="text-zinc-400 hover:bg-zinc-800">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {links.length < 10 && (
          <Button type="button" variant="outline" size="sm" onClick={() => setLinks((c) => [...c, { url: "", title: "" }])} className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800">
            <Plus className="h-4 w-4" /> Add link
          </Button>
        )}
      </Section>
      <Button type="submit" disabled={update.isPending} className={primary}>
        {update.isPending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}

// --------------------------------------------------------------------------------------------- account (AU-6..10)

export function AccountSettings() {
  const { data: me } = useMe();
  if (!me) return <p className="text-sm text-zinc-500">Loading...</p>;
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Account</h1>
      <EmailSection me={me} />
      <PasswordSection me={me} />
      <ConnectedAccounts me={me} />
      <SessionsSection />
      <DeleteSection me={me} />
    </div>
  );
}

function EmailSection({ me }: { me: Me }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <Section title="Email" description={`${me.email} ${me.emailVerified ? "(verified)" : "(not verified)"}`}>
      {sent ? (
        <p role="status" className="text-sm text-zinc-300">We sent a verification link to the new address. Your email changes once you open it.</p>
      ) : (
        <form
          className="flex max-w-md gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void authClient.changeEmail({ newEmail: email, callbackURL: "/settings/account" }).then((result) => {
              if (result.error) toast.error(result.error.message ?? "Could not change your email");
              else setSent(true);
            });
          }}
        >
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="New email address" aria-label="New email address" className={field} />
          <Button type="submit" className={primary}>Change email</Button>
        </form>
      )}
    </Section>
  );
}

function PasswordSection({ me }: { me: Me }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  if (!me.hasPassword) {
    return (
      <Section title="Password" description="You sign in with Google. To also sign in with a password, use “Forgot your password?” on the sign-in page with this email address." />
    );
  }
  return (
    <Section title="Password">
      <form
        className="max-w-md space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const problem = passwordProblem(next, { email: me.email, username: me.username });
          if (problem) return void toast.error(PASSWORD_PROBLEM_MESSAGES[problem]);
          void authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true }).then((result) => {
            if (result.error) toast.error(result.error.message ?? "Could not change your password");
            else {
              toast.success("Password changed. Your other devices were signed out.");
              setCurrent("");
              setNext("");
            }
          });
        }}
      >
        <Label text="Current password"><Input type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" className={field} /></Label>
        <Label text="New password"><Input type="password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" className={field} /></Label>
        <Button type="submit" className={primary}>Change password</Button>
      </form>
    </Section>
  );
}

function ConnectedAccounts({ me }: { me: Me }) {
  const utils = api.useUtils();
  const google = me.providers.includes("google");
  const onlyOne = me.providers.length <= 1;
  return (
    <Section title="Connected accounts">
      <div className="flex items-center justify-between rounded border border-zinc-800 p-3">
        <span className="text-sm">Google {google ? "(connected)" : ""}</span>
        {google ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={onlyOne}
            title={onlyOne ? "You can't remove your only way to sign in" : undefined}
            onClick={() =>
              void authClient.listAccounts().then(async (list) => {
                const account = list.data?.find((a) => a.providerId === "google");
                if (!account) return;
                // Better Auth asks for a recent sign-in before this (freshAge): the message tells the user.
                const result = await authClient.unlinkAccount({ accountId: account.accountId });
                if (result.error) toast.error(result.error.message ?? "Could not disconnect Google");
                else await utils.account.me.invalidate();
              })
            }
            className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800"
          >
            Disconnect
          </Button>
        ) : (
          <Button type="button" size="sm" className={primary} onClick={() => void authClient.linkSocial({ provider: "google", callbackURL: "/settings/account" })}>
            Connect
          </Button>
        )}
      </div>
    </Section>
  );
}

interface SessionRow { id: string; token: string; userAgent?: string | null; ipAddress?: string | null; updatedAt: Date | string }

function SessionsSection() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const load = () => setReloads((n) => n + 1);
  useEffect(() => {
    let alive = true;
    void Promise.all([authClient.listSessions(), authClient.getSession()]).then(([list, me]) => {
      if (!alive) return;
      setSessions((list.data) ?? []);
      setCurrent(me.data?.session.token ?? null);
    });
    return () => {
      alive = false;
    };
  }, [reloads]);
  const describe = (ua?: string | null) => {
    if (!ua) return "Unknown device";
    const browser = ua.includes('Edg/') ? "Edge" : ua.includes('Chrome/') ? "Chrome" : ua.includes('Firefox/') ? "Firefox" : ua.includes('Safari/') ? "Safari" : "Browser";
    const os = ua.includes('Windows') ? "Windows" : ua.includes('Android') ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : ua.includes('Mac OS') ? "macOS" : ua.includes('Linux') ? "Linux" : "";
    return `${browser}${os ? ` on ${os}` : ""}`;
  };
  return (
    <Section title="Where you're signed in">
      {sessions === null ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((session) => (
            <li key={session.id} className="flex items-center justify-between gap-3 rounded border border-zinc-800 p-3 text-sm">
              <span>
                {describe(session.userAgent)} {session.token === current && <span className="ml-1 text-xs text-green-400">this device</span>}
                <span className="block text-xs text-zinc-500">Last active {new Date(session.updatedAt).toLocaleString()}</span>
              </span>
              {session.token !== current && (
                <Button type="button" variant="outline" size="sm" onClick={() => void authClient.revokeSession({ token: session.token }).then(() => load())} className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800">
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Button type="button" variant="outline" size="sm" onClick={() => void authClient.revokeOtherSessions().then(() => { toast.success("Signed out everywhere else"); load(); })} className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800">
        Sign out everywhere else
      </Button>
    </Section>
  );
}

function DeleteSection({ me }: { me: Me }) {
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);
  const del = api.account.deleteAccount.useMutation();
  return (
    <Section title="Delete account" description="Removes your profile, tracks, playlists, comments and likes. This can't be undone.">
      {!open ? (
        <Button type="button" variant="outline" onClick={() => setOpen(true)} className="border-red-500/60 bg-transparent text-red-400 hover:bg-red-500/10">
          Delete my account
        </Button>
      ) : (
        <form
          className="max-w-md space-y-3 rounded border border-red-500/40 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void del
              .mutateAsync({ confirmUsername: typed })
              .then(() => hardNavigate("/"))
              .catch((error: Error) => toast.error(error.message));
          }}
        >
          <Label text={`Type "${me.username}" to confirm`}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className={field} />
          </Label>
          <div className="flex gap-2">
            <Button type="submit" disabled={typed.trim().toLowerCase() !== me.username || del.isPending} className="bg-red-600 text-white hover:bg-red-700">
              Permanently delete
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="text-zinc-300 hover:bg-zinc-800">Cancel</Button>
          </div>
        </form>
      )}
    </Section>
  );
}

// --------------------------------------------------------------------------------------------- privacy / content / notifications

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded border border-zinc-800 p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function useSettingsSaver() {
  const utils = api.useUtils();
  const mutation = api.account.updateSettings.useMutation({
    onSuccess: () => utils.account.me.invalidate(),
    onError: (error) => toast.error(friendlyError(error, "Could not save")),
  });
  return (input: Parameters<typeof mutation.mutate>[0]) => mutation.mutate(input);
}

export function PrivacySettings() {
  const { data: me } = useMe();
  const save = useSettingsSaver();
  if (!me) return <p className="text-sm text-zinc-500">Loading...</p>;
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Privacy</h1>
      <Section title="Your activity">
        <Toggle label="Show my likes on my profile" hint="Turn off to hide your Likes tab from other people." checked={me.showLikes} onChange={(showLikes) => save({ showLikes })} />
        <Toggle label="Show me in creators' top listeners" hint="Creators with a Pro plan can see their most active listeners." checked={me.showInTopListeners} onChange={(showInTopListeners) => save({ showInTopListeners })} />
      </Section>
    </div>
  );
}

const LICENSES = [
  ["ALL_RIGHTS_RESERVED", "All rights reserved"], ["CC0", "CC0 (public domain)"], ["CC_BY", "CC BY"], ["CC_BY_SA", "CC BY-SA"],
  ["CC_BY_ND", "CC BY-ND"], ["CC_BY_NC", "CC BY-NC"], ["CC_BY_NC_SA", "CC BY-NC-SA"], ["CC_BY_NC_ND", "CC BY-NC-ND"],
] as const;

export function ContentSettings() {
  const { data: me } = useMe();
  const save = useSettingsSaver();
  if (!me) return <p className="text-sm text-zinc-500">Loading...</p>;
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Content</h1>
      <Section title="Uploads">
        <Label text="Default license for new tracks">
          <select value={me.defaultLicense} onChange={(e) => save({ defaultLicense: e.target.value as (typeof LICENSES)[number][0] })} className={select}>
            {LICENSES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Label>
      </Section>
      <Section title="Listening">
        <Toggle label="Show comments on waveforms" checked={me.showWaveformComments} onChange={(showWaveformComments) => save({ showWaveformComments })} />
      </Section>
    </div>
  );
}

export function NotificationSettings() {
  const { data: me } = useMe();
  const save = useSettingsSaver();
  if (!me) return <p className="text-sm text-zinc-500">Loading...</p>;
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Notifications</h1>
      <Section title="Email" description="How often we email you about activity on your account. Per-notification choices arrive with notifications.">
        <select aria-label="Email frequency" value={me.emailFrequency} onChange={(e) => save({ emailFrequency: e.target.value as "OFF" | "DAILY" | "IMMEDIATE" })} className={select}>
          <option value="OFF">Off</option>
          <option value="DAILY">Daily digest</option>
          <option value="IMMEDIATE">Immediately (comments, replies, mentions)</option>
        </select>
      </Section>
    </div>
  );
}
