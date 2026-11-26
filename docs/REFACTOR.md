# Refactor: single Next.js app for Vercel + Neon

Living document. **Read this first in a new session**, then `CONTEXT.md`
and `docs/adr/`.

**Product scope:** the complete feature set to build next is specified in [`docs/PRD.md`](PRD.md)
(milestones M0–M8). Where the PRD and `CONTEXT.md` disagree, the PRD wins; update `CONTEXT.md` in M0. Update the checklist and the log at the end of every work session.

Working branch: **`dev`** (PRD implementation; push only to `origin/dev`). The older `refactor/single-nextjs-app` branch is history.

## PRD implementation: status and handoff (READ THIS FIRST IN A NEW SESSION)

Implementation of [`docs/PRD.md`](PRD.md) is in progress, milestone by milestone (PRD §19). Update this section at
the end of every work session (checklist + "Next up" + gotchas), and add a dated entry to the Log at the bottom.

**Owner decisions (apply to all milestones)**

- Global client state uses **zustand** (already installed); add libraries freely when they remove code.
- **Audio scope:** keep today's accepted formats (MP3 first; WAV/OGG/FLAC/AAC/M4A stay accepted as they are today). Do NOT add AIFF or other new formats (this narrows PRD UP-F1/§3.3).
- Code only on `origin/dev`. No PRs unless asked.
- When in doubt about product intent, ask the owner.

**Milestone checklist** (PRD §19)

| Milestone | State |
|---|---|
| M0 Foundation reset | **done** (see "M0 summary" below) |
| M1 Accounts & profiles | **done** (see "M1 summary") |
| M2 Upload & editing | **done** (see "M2 summary") |
| M3 Listening | **done** (see "M3 summary"; Lighthouse run still open, see deviations) |
| M4 Social loop | **done** (see "M4 summary") |
| M5 Discovery | **done** (see "M5 summary") |
| M6 Creator tools & plans | **next** (see "Next up") |
| M7 Trust & safety | not started |
| M8 Polish | not started |

**M0 summary: what exists now** (read these before starting M1)

| Area | Where | Notes |
|---|---|---|
| Schema (PRD §16, all models) | `prisma/schema.prisma`, one baseline `prisma/migrations/0_init` | CHECK constraints (username format, follow/block not self, collection date/visibility, spotlight target, counters >= 0) are hand-written at the end of the migration; `prisma migrate diff` sees no drift. Full-text/trigram search columns are NOT there yet (M5 adds them in a new migration). |
| Visibility (single source of truth) | `src/server/modules/visibility/index.ts` | `effectiveVisibility`, `publicTrackWhere/accessibleTrackWhere/publicCollectionWhere/accessibleCollectionWhere`, `trackAccess/collectionAccess`, secret tokens. Use these for EVERY listing/route; never hand-write visibility conditions. Track route handlers and procedures call `authorizeTrack` (`modules/tracks/authorize.ts`) and answer 404, never 403. |
| Names, slugs, reserved words | `src/lib/names.ts` | A unit test checks every first-level folder of `src/app` is reserved: adding a top-level route without adding it to `RESERVED_USERNAMES` fails CI. |
| Entitlements | `server/modules/plans/entitlements.ts` | Limits + `requireEntitlement` (throws `PLAN_REQUIRED`). Only upload size is enforced so far; upload-time quota (UP-8), scheduling, Quiet Mode etc. are enforced when their features land (M2/M6). |
| Rate limiter | `server/modules/rate-limit` | `enforceRateLimit(db, action, subject, ...rules)`, `RATE_LIMITS` mirrors PRD 14.3. Enforced today: comment (8/min, 200/day), like (60/min + 10 toggles/10 min per target, counted only when committed), upload URLs. Add the rest with their features. |
| Errors | `server/errors.ts` | `appError/planRequired/rateLimited` set `error.data.appCode` (+ `retryAfterSeconds`); the UI mapping to friendly text is still ad hoc (`useTrackLike`, `CommentsSection`): centralise it in M1/M2. |
| Email | `server/modules/email` | `sendEmail(db, mail)` -> Resend or stored as `LOGGED`; templates for verification and reset exist but Better Auth is NOT wired to send them yet (M1). |
| Storage deletion queue + daily cron | `server/modules/storage/deletion.ts`, `server/modules/housekeeping.ts`, `app/api/cron/daily`, `vercel.json` | Cancel/expire/image replacement enqueue keys and drain via `runAfter()` (`server/after.ts`). Cron today: expire unattached assets, drain queue, prune rate-limit buckets, email bodies, play events > 13 months, username redirects > 30 days. Account purge and digests come with M1/M4. `demo/` and `random-artwork-images/` are protected. |
| Image pipeline | `server/modules/media/artwork-processing.ts`, `src/lib/artwork.ts` (`IMAGE_SPECS`) | `processImageObject(r2, {purpose})` for ARTWORK / AVATAR / BANNER; `/api/images/[assetId]?w=` serves avatars, banners, collection artwork with access checks. No UI uploads avatars/banners yet (M1). |
| Publishing | `server/modules/publishing`, `server/api/routers/upload.ts` | `publishTrack`, `publishCollection` (atomic claim READY -> ATTACHED, slugs with -2/-3 and retry on a unique race, secret tokens, activities, `publicTrackCount`). `markUploadComplete` now REQUIRES the browser analysis. Procedures: `createTrack`, `createCollection` (replaces createRelease). The upload UI is still the old two-step form (M2 rebuilds it). |
| Routers | `server/api/routers/*` | `tracks.byPermalink`, `collections.byPermalink`, `profiles.{byUsername,tracks,collections}`, `discover`, `engagement.setTrackLike`, `comments`, `upload`. Old `artist` router is gone. Shared DTO builder: `modules/tracks/dto.ts` (`trackDtoSelect`, `toTrackDto`, `userAvatarUrl`). |
| Pages | `app/(player)/[username]`, `[trackSlug]`, `[trackSlug]/[secret]` (`s-` prefix), `sets/[slug]`, `sets/[slug]/[secret]`; legacy `app/track/[id]`, `app/u/[id]`, `app/profile` | Everything user-facing stays under `(player)` so playback survives navigation. Profile page has the old tab layout with Tracks/Popular/Albums/Playlists wired (Reposts is a placeholder). |
| Stats + repair | `server/modules/stats.ts`, `server/modules/recount.ts`, `pnpm db:recount` | `bumpTrackDailyStat` is called inside the transactions of plays/likes/comments (same-day undo only, per IN-6). |
| Seed | `prisma/seed.ts`, `prisma/seed/demo-media.ts`, `SEED_README.md` | `DATABASE_URL=<local> pnpm db:seed` (refuses Neon unless `--force`). Demo login `demo@example.test` / `DemoPassword123!`. Demo media is prepared once into `demo/` in R2 (manifest). |
| Tests | unit `src/**/*.test.ts` (55), integration `tests/integration` (98), e2e `tests/e2e` (33 + 1 opt-in real-R2) | e2e fixtures: `tests/e2e/fixtures.ts` (creator `e2e-creator`, public/likes/plays/private/scheduled tracks, an album, a private playlist). |

**M1 summary: what exists now** (accounts, profiles, follow)

| Area | Where | Notes |
|---|---|---|
| Auth config | `src/lib/auth.ts` | Verification email (24 h, `sendOnSignUp`), reset (1 h, single use, `onPasswordReset` deletes all sessions), password rules via `hooks.before` (`src/lib/passwords.ts`: min 8, common list, not your email/username), change email, account linking (Google). Mails go through `sendLimited` = `RATE_LIMITS.emailPerHour` per address+template, silently dropped over the limit (no enumeration). `onboardedAt` is an extra user field. |
| Verified-email gate (AU-4) | `verifiedProcedure` in `server/api/trpc.ts` | Reads the DB (not the cached session). Applied to `upload.getUploadUrl/markUploadComplete/createTrack/createCollection` and `comments.create`; add it to repost/message later. Image upload URLs are NOT gated (avatars in onboarding). |
| Accounts module | `server/modules/accounts/{index,deletion,suggestions}.ts`, `src/lib/onboarding-rule.ts` | `checkUsername` (+ suggestions), `changeUsername` (30-day redirect + hold), `setUserImage` (avatar/banner claim + old rendition deletion), `completeOnboarding`, `markAccountDeleted` + `purgeAccountContent` + `purgeDeletedAccounts` (cron; row kept 30 days), `whoToFollow` (2-hop, genres, popularity; excludes self/followed/blocked). |
| Follow | `server/modules/social/follow.ts` | `setFollow`: counters + `UserDailyStat` move only with real rows in one tx, rate limit counted only when committed, 2000 cap, block check. Router: `engagement.setFollow`. |
| Routers | `account` (`me`, `checkUsername`, `onboardingSuggestions`, `completeOnboarding`, `updateProfile`, `updateSettings`, `deleteAccount`), `profiles` (+ `relationship`, `tabPage`, `spotlight`, `follows`, `suggestions`) | `profiles.tabPage` serves every tab with offset cursors (`server/modules/profiles/lists.ts`, page size 20). |
| UI: auth | `(player)/{signin,signup,forgot-password,reset-password,verify-email,onboarding}`, `components/auth/*`, `store/authPrompt.ts` | `useAuthPrompt().show(reason, retry)` opens the modal (AU-2); like and follow retry once after sign-in. `OnboardingGuard` (client) forces `/onboarding`. `getSessionUser()` (`server/session-user.ts`) reads the shell's user from the DB. |
| UI: settings | `(player)/settings/*` | Profile (avatar/banner upload via `ImageUploader`, username rename, links), Account (email, password, Google link, sessions, sign out elsewhere, delete), Privacy, Content, Notifications (email frequency only). |
| UI: profiles | `(player)/[username]/*` | `ProfileShell` + real routes `/ (all) /popular-tracks /tracks /albums /sets /reposts /likes /followers /following`; infinite scroll + "Load more" (`ProfileList`, `UserList`); Spotlight on All; `FollowButton`; "Who to follow" on Home. |
| Tests | integration `accounts`, `follow`; unit `passwords`, `onboarding-rule`; e2e `accounts.e2e.spec.ts` (J2, AU-2 retry, follow/unfollow, rename redirect, reset, verify banner) | e2e `signUp` helper now marks the user verified+onboarded by default (`{verified:false, onboarded:false}` to opt out) and `latestEmailLink()` reads LOGGED emails. |

**M2 summary: what exists now** (upload, editing, plans page)

| Area | Where | Notes |
|---|---|---|
| Field schemas | `src/lib/track-fields.ts`, `src/lib/collection-fields.ts` | Shared zod schemas for every PRD 7.3/7.4 field (+ ISRC normaliser, key list, licenses, `titleFromFilename`, default preview start, schedule rule). Used by forms and procedures. |
| Publishing | `server/modules/publishing/{index,fields,edit,genre}.ts` | `publishTrack` / `publishCollection` take the full field set (per-track overrides over release defaults); `resolveVisibility` implements the privacy transitions (public sets `publishedAt` once, scheduling is Pro + 5 min..1 year, scheduled feed entries are dated at `publishAt`); `assertUploadQuota` (UP-8, also in `markUploadComplete`, which deletes the object when over quota); `updateTrack`, `deleteTrack`, `replaceTrackAudio` (Pro), `resetTrackSecret`, `trackDeleteImpact`, `slugAvailability`/`renameSlug` (SlugRedirect), `normaliseCollection` + `lockCollection`. |
| Collections | `server/modules/collections/edit.ts` | `updateCollection` (type change needs a date, first-public activity once, apply genre/tags to own tracks, label/publisher to own tracks lacking them), `addTracksToCollection` (own tracks of any visibility, others' only if public, max 500, appended), `removeTrackFromCollection`, `reorderCollection` (stale list refused), `deleteCollection` (optionally the owner's own tracks only). All serialised per collection by an advisory lock. |
| Routers | `tracks` (+ `forEdit`, `update`, `delete`, `deleteImpact`, `resetSecret`, `checkSlug`, `replaceAudio`, `mine`), `collections` (+ `forEdit`, `update`, `checkSlug`, `resetSecret`, `addTracks`, `removeTrack`, `reorder`, `delete`), `upload` (+ `quota`; `createTrack`/`createCollection` take the new schemas), `plans` (`entitlements`, `setPlan`) | `accountProcedure` (`ctx.account` = id + fresh plan) underlies `verifiedProcedure`. |
| Upload UI | `src/components/upload/*`, `src/store/uploadBatch.ts`, `src/trpc/vanilla.ts` | Zustand store runs the per-file pipeline Queued -> Uploading -> Analysing -> Verifying -> Ready/Failed (3 uploads, 2 decodes, retry/remove). `UploadApp` (drop zone, "make a playlist" checkbox, usage bar, rejected files), `SingleTrackStage`, `ReleaseStage` (release details, dnd-kit sortable list with keyboard support, bulk actions, privacy warning), `TrackFieldsEditor` (4 tabs; PRO tags + upsell dialog). |
| Edit UI | `src/components/editor/*`, `(player)/studio/{tracks,sets}/[id]/edit` | `TrackEditor` (all fields, secret link box, replace audio, delete with consequences), `CollectionEditor` (Basic / Tracks / Metadata, live reorder, add tracks, delete with two options), success `PublishedBanner` (`?new=1|private|scheduled`) and owner `OwnerVisibilityBanner` on track and collection pages, Edit buttons. |
| Plan page | `(player)/settings/plan` | PL-1/PL-2 comparison + demo upgrade/downgrade, creates a SYSTEM notification row (nothing reads notifications yet). |
| Tests | integration `editing.test.ts` (24), unit `track-fields.test.ts`, e2e `upload.e2e.spec.ts` (J3, J4, J7, J8, quota, UP-2/UP-5, UP-3, editing) | e2e replaces object storage with the DB through `mockUploadStorage()` (tRPC batches procedures into one request: the mock answers each by name), so no R2 credentials are needed; the opt-in real-R2 journey (`upload-playback.e2e.spec.ts`) was updated to the new UI. |

**M3 summary: what exists now** (listening)

| Area | Where | Notes |
|---|---|---|
| Queue model | `src/lib/player-queue.ts` (pure, 11 unit tests) | Context (list played from) + user queue ("Play next" / "Add to Next up", always before the context resumes) + history (50). `cursorId` = last context track played. Shuffle pins the current track first and re-shuffles on repeat-all wrap; previous restarts after 3 s, else history, else previous context track; `canPlay` skips formats the browser cannot decode (UP-F3). |
| Player store | `src/store/player.tsx` | Actions `playContext(tracks, track, {name, source, collectionId})` (use this instead of `setPlaylist`+`playTrack`), `playNext`, `addToQueue`, `removeFromQueue`, `moveInQueue`, `clearQueue`, `playFromQueue`, `toggleShuffle`, `cycleRepeat`, `toggleAutoplay`. Persists to `localStorage` key `player-state-v1` (restored paused, never autoplays), single-tab playback through `BroadcastChannel`, Media Session (play/pause/next/prev/seek/position), stream error -> one cache-busted retry then toast + skip, buffered range. Shortcuts: Space, arrows, Shift+arrows, M, S, Q, L, ? (`SHORTCUTS`, `useKeyboardControls`). Autoplay at the end of a context calls `tracks.related` (seam for M5 recommendations). |
| Play reporting | `POST /api/tracks/:id/play` now returns `{eventId}` (JSON; a deduped play returns the listener's latest event) and takes an optional body `{source, collectionId}`; `POST /api/plays/:eventId/progress` (`{listenedMs, completed}`, only ever grows, capped, always 204) is sent as a beacon when a track ends or the page hides. `recordPlayEvent` in `server/modules/tracks/plays.ts` (`recordPlay` still returns a boolean). |
| Related tracks | `server/modules/tracks/related.ts`, `tracks.related` | Public only, never the seed, same creator first, then co-likes, then genre/tags; at most 2 per creator. A hidden seed answers empty. |
| Playlists | `server/modules/collections/playlists.ts`, `collections.mine` / `collections.createPlaylist` | `mine({trackId})` lists the caller's playlists with `hasTrack`; `createPlaylist` makes a private playlist by default (slug via `firstFree`). Add/remove use the existing `addTracks` / `removeTrack`. |
| Downloads | `GET /api/tracks/:id/download` | Signed-in only (401), 403 unless `downloadable` (owner always allowed), same visibility rules, 307 to a 5-minute presigned attachment URL; `downloadCount` +1 once per user per track per 24 h (fixed-window rate-limit bucket, owner never counts). |
| Embeds | `/embed/track/[trackId]`, `/embed/set/[collectionId]` (`?s=` secret), `src/app/embed/*`, `next.config.js` headers | Own layout without navbar. `/embed/*` sends `frame-ancestors *`, everything else `frame-ancestors 'self'` + `X-Frame-Options`. Honours `embeddable`; public or secret only. The navbar now lives in `(player)/layout`, not the root layout. |
| UI | `src/components/player/*`, `src/store/dialogs.ts`, `GlobalPlaybackControls.tsx` | `TrackMenu` (the "..." menu on cards, waveform rows, related list, player bar), `AddToPlaylistDialog` (Add / Create tabs), `ShareDialog` (link, "At 1:23", X/Facebook/WhatsApp/Email, Web Share, Embed tab), `NextUpPanel` (Q), `ShortcutsDialog` (?), `MobileTabBar` + mini player + full-screen sheet below `sm`. Dialogs are opened through the `useDialogs` store and mounted once by `GlobalDialogs`. The bar shows real artist, like, follow, menu, shuffle/repeat, buffered range. |
| Pages | `TrackPage.tsx`, `CollectionPage.tsx`, `RelatedTracks`, `CollectionActions`, `CommentMarkers` | Track page: follow button, related sidebar, "In: albums/playlists", BPM/key/ISRC/publisher/license, buy link, JSON-LD `MusicRecording`, Open Graph + Twitter card. `#t=1m23s` (`src/lib/time-fragment.ts`) starts the track at that time. Collection page: Play / Shuffle / Share, rows play the collection as context (plays are credited to it). Waveform: comment markers cluster (`src/lib/marker-clusters.ts`), live bubble for the comment being passed, hidden when the user turned off `showWaveformComments`. Equaliser bars on the playing row. |
| Tests | integration `listening.test.ts` (5), unit `player-queue`, `time-fragment`, `marker-clusters`, e2e `listening.e2e.spec.ts` (J1, J5, embeds + CSP, downloads) | J5 here covers playlists, queue and share; liking an album and the Library are M4. |

**Deliberately deferred / deviations** (each has an owner milestone):

- The 30 s preview window is a slider (not a draggable window on the waveform); only the player/Discover preview in M5 (DI-4) will use it.
- ID3/Vorbis tag reading to prefill metadata (UP-9, P2) is not done; titles come from file names.
- Studio list pages (`/studio/tracks`, `/studio/sets`) and bulk edit are M6; the entry points to the editors (pencil on the hero, Edit on collections, banners) exist.
- Collection "Liked by"/likes, reposts, notifications: M4. Email notification of plan changes: M4.
- Image uploads have no crop UI (M1 note still applies). Replacing audio re-runs the whole upload pipeline for one file.
- Quota counts the durations of existing tracks only; READY-but-unpublished uploads do not count until published.

**M4 summary: what exists now** (social loop)

| Area | Where | Notes |
|---|---|---|
| Engagement | `server/modules/social/engagement.ts`, router `engagement` | `setCollectionLike`, `setCommentLike`, `setTrackRepost`, `setCollectionRepost` (+ the older `setTrackLike`, `setFollow`). Same rules as track likes: idempotent, not your own, public only (reposts and likes), counters change with real rows in the transaction, rate limits (`like`, `repost`). Reposts create/delete an `Activity` and a notification. |
| Notifications | `server/modules/notifications/{index,read,email}.ts`, router `notifications`, `lib/notification-text.ts` | `notify` (never self, never when the recipient blocked the actor, respects the in-app preference, once per actor+type+target) / `unnotify` (deletes the unread one, NT-4) are called inside the action's transaction: follow, track/collection/comment like, reposts, comment, reply, mention (`@username`, max 5). Read side groups by `groupKey` (`listNotifications`, filters All/Likes/Reposts/Comments/Follows/Mentions, `unreadCount` counts groups, `markRead`). `describeNotification` builds the sentence for UI and email. |
| Email | `notifications/email.ts`, `/api/unsubscribe` | Daily digest runs in the daily cron (`sendDailyDigests`, once per notification via `emailedAt`), "Immediately" users get comment/reply/mention emails after the response (`sendImmediateEmails`, coalesced per 5 min). Defaults per NT-7 (`EMAIL_DEFAULT_ON`). Every email carries a signed one-click unsubscribe link + `List-Unsubscribe` headers. All emails stay LOGGED until `RESEND_API_KEY` is set. `account.notificationPreferences` / `setNotificationPreference` back the table in Settings → Notifications. |
| Feed | `server/modules/feed`, router `feed`, `(player)/feed` | Followed actors' activity, public targets only, blocks respected, de-duplicated per target with "A, B and N others reposted", tabs All/Tracks/Albums & playlists/Reposts, cursor `(createdAt,id)`, "N new posts" pill polled every 60 s, queue context "Your feed". |
| Library | `server/modules/library`, router `library`, `(player)/you/*` | `/you/library` (overview), `/likes` (Play all / Shuffle), `/sets`, `/albums` (created + liked, filter chips, create playlist), `/following`, `/history` (last 200 distinct tracks, "Clear listening history" via `historyClearedAt`). Each page guards itself with `requireUser` (pages render in parallel with their layout). |
| UI | `NotificationBell`, `/notifications`, `RepostButton`, `CollectionActions` (like + repost), `CommentsSection` | Navbar: bell, Feed, Library for signed-in users. Comments: likes, sort (Newest/Oldest/Track time), 20 threads per "Load more", first 3 replies + "View N more", `@mentions` render as profile links. |
| Tests | integration `social.test.ts` (9), e2e `social.e2e.spec.ts` (J6, bell + grouped notifications page, library) | |

**Deviations from M3** (owner milestone in brackets):

- Lighthouse targets on the track page have not been measured yet (no Chrome-based Lighthouse run in the sandbox). Run it against a production build before release [M8].
- Related tracks are heuristic (creator, co-likes, genre/tags), not ranked recommendations [M5]. The player's autoplay uses them.
- "Reposted by" / "Liked by", repost and album like buttons are placeholders or absent [M4]. The track page "Message" button was removed (messages are P2 in M7).
- The player bar's Follow button always starts as "Follow" (it does not know the relationship); the track page's is accurate [M4].
- Download dedupe uses a fixed 24 h window, not a rolling one.
- The embed player is minimal (artwork, seek bar, list); no waveform [M8].
- Chosen play sources are set where the list is known (collection page, track page, related); Home/Discover/Profile lists still report `OTHER` unless their callers pass `context` to `TrackCard` / `WaveformTrackItem` [M4/M5].

**M5 summary: what exists now** (discovery)

| Area | Where | Notes |
|---|---|---|
| Search | migration `1_search` (pg_trgm, `ms_track_tsv` / `ms_user_tsv`, GIN indexes), `server/modules/search`, router `search` | Expression indexes, no new columns. `websearch_to_tsquery('simple')` + trigram similarity + prefix bonus, ranked x log(plays+likes+2) / recency decay. Candidates come from SQL, then rows are re-loaded with `publicTrackWhere` / `publicCollectionWhere` (visibility re-checked, never trusted from the prefilter). `suggest` (3 people, 4 tracks, 2 albums, 2 playlists), `tracks` (+ genre, duration, added, license filters), `people`, `collections`. Offset paging (max 400 candidates). Anonymous callers are rate limited per IP. |
| Search UI | `components/SearchBox.tsx` (navbar combobox: 150 ms debounce, 2+ chars, arrows/Enter/Esc, recent searches in localStorage), `(player)/search` | Tabs Everything/Tracks/People/Albums/Playlists, top result, track filters, "no results" shows trending (SE-5), `#tag` redirects to `/tags/tag`. Needs `pg_trgm` on the database (Neon allows it; the migration runs it). |
| Recommendations | `server/modules/recommendations/{scoring,index}.ts` (+ unit tests), `discover.forYou` / `discover.trending`, `tracks.related` | Taste profile (likes x3, reposts x3, completed plays 90 d x1, playlist adds x2, onboarding genres x2, followed creators), cached 10 min per user in memory (per server instance). `recommendForUser`: candidates by top genres/tags + co-likes, excludes own/liked/reposted/played-in-7-days/blocked, max 2 per creator, cold start = trending in favourite genres. `related` now orders genre/tag matches by genre + Jaccard. "Start station" in the track menu queues the seed + 49 related (source STATION). |
| Charts | `server/modules/charts`, router `charts`, `(player)/charts` | Top 50 from `TrackDailyStat` (7 days), New & Hot (30 days, plays/day with recency boost), per genre, cached 10 min (empty results are not cached). Rank change vs yesterday is not built (P2). |
| Tags | `server/modules/tracks/tags.ts`, `discover.byTag`, `/tags/[tag]` | Tracks + collections with the tag or genre slug, Popular/Latest; tags on the track page link here. |
| Home | `(player)/page.tsx`, `Carousel`, `TrackCarousel` | Signed out: hero, Trending now, New releases (collections), Fresh tracks, genre tiles, popular creators. Signed in: Recently played, More of what you like, New from people you follow, Trending in each of up to 3 favourite genres, then the same public modules, Who to follow. Each module hides when empty. Lists now report their play source (HOME / DISCOVER / SEARCH / CHARTS / HISTORY / LIBRARY). |
| Discover | `(player)/discover` | "Made for you" and "Fresh from your genres" for signed-in users on the unfiltered view, infinite scroll (`DiscoverGrid`, keyed by the filters so a filter change resets it). The old `?q=` still works. |
| Tests | integration `search.test.ts` (5), `recommendations.test.ts` (5), unit `scoring.test.ts` (6), e2e `discovery.e2e.spec.ts` (search, autocomplete, charts, tags, signed-in Home/Discover) | |

**Deviations from M4** (owner milestone in brackets):

- `@` autocomplete in the comment composer is not built (mentions work when typed in full) [M8].
- Comment sorting/paging happens in the browser over the (max 100) threads the server returns [M8].
- Repost captions are accepted by the API but there is no "Repost with caption" UI (P2) [M8].
- `PLAYLIST_ADD` and `NEW_RELEASE` notification types exist in preferences but nothing creates them yet [M6].
- "Liked by people you follow" avatars (LK-5, P2) are not built.
- The player bar Follow button still does not know the relationship; Home/Discover lists still report play source `OTHER` [M5].

**Deviations from M5** (owner milestone in brackets):

- No quick-preview on hover (DI-4, P2) and no "Your mixes" Home module (P2); `previewStartMs` is stored but unused [M8].
- No people filter by city/country in search (P2); search pagination is offset-based over at most 400 ranked candidates.
- Chart rank change vs yesterday (P2) and `unstable_cache` are not used: the cache is an in-memory Map per server instance (so on Vercel each lambda warms its own).
- The taste-profile cache is also per instance.
- Search results do not exclude blocked creators for the viewer [M7].
- "Popular creators" on the landing page reuses `profiles.suggestions`.

**Next up: M6 Creator tools & plans** (PRD §15 and §2.3; exit: J10 passes; entitlement tests for every gated feature)

1. Studio (`/studio/tracks`, `/studio/sets`): tables with sort/filter, bulk edit (privacy, genre, tags, delete), replace-audio entry, the entry points to the existing editors.
2. Insights (`/studio/insights`) from `TrackDailyStat` / `UserDailyStat`: plays, likes, reposts, comments, followers over time, top tracks, countries (`PlayEvent.countryCode`), traffic sources (`PlayEvent.source`); Pro gates (longer ranges, per-track detail).
3. Plan gating everywhere via `getEntitlements` (scheduling, Quiet Mode, replace audio, spotlight count, upload time), Spotlight editing on the profile, Quiet Mode (`statsPublic`) toggles.
4. Create the `PLAYLIST_ADD` notification when someone adds your track to a public playlist, and `NEW_RELEASE` (opt-in) for followers.
5. Tests: J10, an entitlement test per gated feature.

<details><summary>M4 plan as it was (done)</summary>

**Next up (old): M4 Social loop** (PRD §9..: collection and comment likes, reposts, Activity + Feed, notifications in-app + email + digest, Library, history, comment upgrades CM-*; exit: J6 and counter tests green)

1. Likes for collections and comments, reposts (tracks and collections) with the counters-in-transaction rule and `db:recount` coverage; show real "Liked by / Reposted by" on track and collection pages; enable the Repost buttons that are placeholders today (`TrackDetailHero`, `WaveformTrackItem`).
2. `Activity` rows (new track, repost, playlist add, new follower) and the `/feed` page; wire the `PLAYLIST_ADD` activity into `createPlaylist` / `addTracks` for public playlists.
3. Notifications: in-app bell + page, email through `server/modules/email` (status LOGGED until `RESEND_API_KEY` exists), daily digest in the cron.
4. Library (`/library`: Likes, Playlists, Albums, Following, History) and play history (PlayEvent already stores `listenedMs`).
5. Comment upgrades (CM-*), then pass `context` (source) from Home/Discover/Profile lists.
6. Tests: J6, counter consistency, e2e for the Library.

</details>

<details><summary>M3 plan as it was (done)</summary>

(removed items kept for history)

1. Player upgrades (PL-P1..P11): shuffle/repeat, queue model (context + user queue + history), Next up panel, Play next / Add to Next up in every row menu, autoplay hook (related tracks come in M5, leave the seam), persistence in `localStorage`, keyboard shortcuts, Media Session actions, play-progress beacon `POST /api/plays/:id/progress`, single-tab playback via `BroadcastChannel`, presigned URL expiry recovery.
2. Mobile layout (GL-4/GL-5): bottom tab bar, mini player, full-screen player sheet.
3. Track page completion (8.3: related sidebar placeholder, In albums/playlists, liked-by/reposted-by come with M4, metadata block, SEO JSON-LD, Twitter card) and collection page (8.4: Play/Shuffle, actions, per-row menus, equaliser icon, unavailable rows already done).
4. Add-to-playlist dialog (8.5) + playlist creation (`collections.createPlaylist`), library entry points, share dialog + embeds (`/embed/track/[id]`, `frame-ancestors`), downloads route (`/api/tracks/:id/download`, DL-1), `#t=` time links.
5. Waveform extras (WF-2..WF-4: click-to-load, clustered comment markers, live comment bubble), Settings toggle `showWaveformComments`.
6. Tests: e2e J1 and J5 (needs add-to-playlist), a11y checks on the player, Lighthouse run on a production build.

</details>

**Environment gotchas for agents (cloud sandbox)**

- The sandbox's shell env has `DATABASE_URL` pointing at the **production Neon** database (and `DATABASE_URL_POOLED`). dotenv does NOT override real env vars, so a bare `pnpm prisma migrate ...` targets Neon (unreachable on TCP 5432 from here, but never rely on that). **Always prefix DB commands with the local URLs**:
  `DATABASE_URL=postgresql://streamer:streamer@localhost:5432/streamapp DATABASE_URL_UNPOOLED=postgresql://streamer:streamer@localhost:5432/streamapp pnpm ...`
  Tests: `TEST_DATABASE_URL=postgresql://streamer:streamer@localhost:5432/streamapp_test`.
- Local Postgres 16: `service postgresql start`; if the role is missing: `su postgres -c "psql -c \"create role streamer login superuser password 'streamer'\" -c 'create database streamapp owner streamer' -c 'create database streamapp_test owner streamer'"`.
- R2 is reachable from the sandbox with the env credentials (bucket has demo audio under `uploads/…`, artwork pool under `random-artwork-images/`). **Never delete objects in the shared demo prefixes.**
- The production Neon database is NOT touched by `dev` work. M0 replaces the migration history with a fresh baseline; before `master` is ever deployed with it, the Neon schema must be reset (see "Open items for the owner" below).

**Recipes used in the cloud sandbox** (set the env inline; never rely on the ambient `DATABASE_URL`):

```bash
LOCAL=postgresql://streamer:streamer@localhost:5432
# fresh test DB + integration tests
DATABASE_URL=$LOCAL/streamapp_test DATABASE_URL_UNPOOLED=$LOCAL/streamapp_test pnpm prisma db execute --stdin <<< "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
DATABASE_URL=$LOCAL/streamapp_test DATABASE_URL_UNPOOLED=$LOCAL/streamapp_test pnpm db:migrate
DATABASE_URL=$LOCAL/streamapp DATABASE_URL_UNPOOLED=$LOCAL/streamapp TEST_DATABASE_URL=$LOCAL/streamapp_test pnpm test:integration
# e2e (wipes the test DB, builds, starts the app on :3100); chromium is preinstalled in the sandbox
DATABASE_URL=$LOCAL/streamapp DATABASE_URL_UNPOOLED=$LOCAL/streamapp TEST_DATABASE_URL=$LOCAL/streamapp_test \
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome pnpm test:e2e --trace off
# the opt-in real-R2 journey additionally needs: E2E_R2=1 E2E_PORT=3000 E2E_BROWSER_PROXY="$HTTPS_PROXY"
# dev server + demo data
DATABASE_URL=$LOCAL/streamapp DATABASE_URL_UNPOOLED=$LOCAL/streamapp pnpm db:migrate && pnpm db:seed   # (with the same env)
```

**Open items for the owner**

- Before merging `dev` into `master`: reset the Neon database schema (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;` on the direct URL) and let `prisma migrate deploy` apply the new `0_init`, because the baseline replaces migrations `0_init`..`2_artwork_image_widths`. Vercel's `vercel-build` would otherwise fail on the history mismatch.
- Set on Vercel before deploying M0: `CRON_SECRET` (the daily cron endpoint refuses callers without it), and optionally `RESEND_API_KEY` + `EMAIL_FROM`, `ADMIN_EMAILS`. Note the variable names differ between Vercel (`DATABASE_URL` = pooled, `DATABASE_URL_UNPOOLED` = direct) and the cloud sandbox (`DATABASE_URL`, `DATABASE_URL_POOLED`): the app reads `DATABASE_URL` (pooled at runtime) and `prisma.config.ts` prefers `DATABASE_URL_UNPOOLED` for migrations.
- Old user uploads in R2 (`uploads/<oldUserId>/…`, `artworks/<oldUserId>/…`, `waveforms/…`) become orphaned once the DB is reset. The seed copies the demo audio it needs to `demo/…`; the rest can be erased by the owner at their discretion (not done automatically).

## Goal

A pro-level portfolio demo (SoundCloud-style creator platform) that is:

- deployed on **Vercel (Hobby)** with **Neon Postgres (free)** and **Cloudflare R2**;
- one Next.js backend, structured so it could become a real product later.

## Decisions

| # | Decision | Why |
|---|----------|-----|
| 1 | Keep the repo and Prisma schema; consolidate in place, no rewrite | The normalized schema, ADR, R2 asset lifecycle and auth are the valuable parts |
| 2 | Remove `apps/express`; port its routes to Next Route Handlers | Separate `*.vercel.app` projects are different sites (Public Suffix List), so auth cookies break; Vercel functions cannot hold sockets |
| 3 | Do not proxy audio through any server. Public tracks: R2 public/custom domain. Private/unlisted: Route Handler authorizes, then redirects to a short-lived presigned R2 GET | Keeps audio bytes off Vercel's free bandwidth; R2 supports range requests; likely fixes the old "chunk pending at 2 min" proxy bug; gives private/unlisted authorization |
| 4 | Waveform peaks + duration computed in the browser at upload (Web Audio), stored as small JSON in R2. `media-worker` becomes optional (Docker/Actions) | FFmpeg/audiowaveform do not fit Vercel free (250MB function limit, daily-only cron) |
| 5 | Drop socket.io (use polling/SSE if realtime is ever needed) | Not supported on Vercel functions |
| 6 | Drop Turborepo when only one app remains; hoist the app to the repo root; keep pnpm | One app does not need a task runner or workspaces |
| 7 | Migrate architecture on current versions first, then upgrade deps as separate commits | Failures stay attributable |
| 8 | Domain logic in `server/modules/*` plain services, storage/queue behind small interfaces | Keeps the app extractable later |

## Roadmap / checklist

- [x] **Phase 0 - safety net**: typecheck, lint (0 errors), tests, build, CI workflow
- [x] **Phase 1 - consolidate**: Express routes ported to Next Route Handlers; `apps/express` deleted (socket.io was never used)
- [x] **Phase 2 - audio delivery**: presigned R2 redirect; private/unlisted authorization; `POST /api/tracks/:id/play`. Play dedupe done (see Track delivery)
- [x] **Phase 3 - waveform**: browser-side peaks + duration at upload; `media-worker` is now optional (backfill only; `pnpm dev:worker`)
- [x] **Phase 4 - de-monorepo**: app hoisted to repo root; Turborepo, `packages/*` and the optional `media-worker` deleted (fresh app: no backfill needed)
- [~] **Phase 5 - dependency upgrades** (done: in-range bumps, Better Auth 1.7, Next 16, Prisma 7, zod 4 + resolvers 7, zustand 5, lucide 1; skipped on purpose: TypeScript 7, ESLint 10, Prisma 8 RC) (one commit each, read current migration guides first): Next, React, Prisma (+ `generator` output path, deprecated in Prisma 7), Tailwind, Better Auth, zod, rest
- [~] **Phase 6 - Neon + Vercel** (done by user: Neon project, `0_init` migration, Vercel project on `master`; todo: verify deployed app end to end): pooled `DATABASE_URL` at runtime, direct URL for migrations; switch `db push` to `prisma migrate`; verify custom `stream` schema on Neon; deploy
- [x] **Phase 7 - quality**: 16 integration tests (claim race, rollback, ownership, visibility, auth), lint at 0 warnings (enforced), README. Remaining ideas: dedupe play events, rate limiting, E2E in CI, demo screenshots

## Commands

```bash
pnpm install
pnpm check-types   # tsc
pnpm lint          # eslint, fails on any warning
pnpm test          # unit tests, node:test, src/**/*.test.ts (no DB)
TEST_DATABASE_URL=postgresql://... pnpm test:integration   # 98 tests against a real Postgres (skips if unset)
TEST_DATABASE_URL=postgresql://... pnpm test:e2e           # Playwright, WIPES that database, builds + starts the app (33 tests, +1 opt-in real-R2 test)
DATABASE_URL=postgresql://... pnpm db:seed                 # demo world (see SEED_README.md)
DATABASE_URL=postgresql://... pnpm db:recount              # repair every denormalised counter
SKIP_ENV_VALIDATION=1 pnpm build   # no real env needed to build
```

CI (`.github/workflows/ci.yml`) runs type check, lint, unit, migrations + drift guard, integration and e2e on PRs and `master`.

## Environment

Real secrets are configured in the cloud environment (not in the repo). Names are listed
in `.env.example`; validation schema is `src/env.js`. A session started
before the variables were added will not see them.

## Track delivery (current design)

All under `src/app/api/tracks/[trackId]/`, logic in `src/server/modules/tracks/`:

| Route | Behaviour |
|-------|-----------|
| `GET stream` | visibility check -> `307` to presigned R2 GET (1 h). Range/seek handled by R2 |
| `GET waveform` | overview JSON streamed through the function (small, immutable, `public` cache only for PUBLIC tracks) |
| `GET artwork` | `307` to `publicUrl` or presigned URL (fallback when `R2_PUBLIC_BASE_URL` is unset) |
| `POST play` | `recordPlay()` in `server/modules/tracks/plays.ts`: one counted play per listener (account, else HMAC(ip+user-agent)) per track per 30 min, serialised with a Postgres advisory lock; always answers 204 for a viewable track. The player calls it after 5 s of real listening |

Visibility (since M0, superseding the text below): PUBLIC = anyone; PRIVATE = owner or anyone with the secret link (`?s=`, or `?c=<collectionId>&s=`); SCHEDULED = private until `publishAt`. Denied and missing both return 404. See `server/modules/visibility`.
The old JWT playback-token flow (`stream.getPlaybackToken`, `JWT_PLAYBACK_SECRET`) and the desktop auth-code exchange
(`/auth/exchange-code`, in-memory map, incompatible with serverless) were dropped. The legacy unauthenticated `/api/upload` was removed.

## Upload analysis (current design)

`FileStepForm` decodes the file with Web Audio (`lib/analyze-audio.ts`) while it uploads to R2, computing duration and
20 min/max pairs per second as signed 8-bit (`lib/waveform-compute.ts`). The result rides along on
`upload.markUploadComplete({ mediaAssetId, analysis? })`. The server (`server/modules/tracks/analysis.ts`) validates it
(ranges, peak count must match duration), writes audiowaveform-format JSON to `waveforms/{userId}/{audioAssetId}/v1/overview.json`,
creates an `ATTACHED` WAVEFORM asset and a `READY` `AudioAnalysis` in one transaction. If the browser cannot decode the file
the upload still succeeds with `AudioAnalysis.FAILED` (UI shows no waveform). Cancelling/expiring the audio also deletes its waveform.
No `MediaProcessingJob` is queued anymore. Trust model: peaks are client-supplied, so a creator could fake their own waveform; acceptable for a demo.
The unused 100 px/s detail waveform is no longer produced.
Rendering (`buildWaveformBars` in `lib/waveform-utils.ts`): bar count = display width / 3 px (2 px bar + 1 px gap), each bar is the RMS of the 50 ms peak amplitudes it covers, scaled so the 99th percentile bar is full height. The stored format did not change.

## Demo data

`pnpm db:seed` (see `SEED_README.md`) builds the whole demo world. The old `db:seed:r2` script was removed in M0.

## Log

> The Log below is history up to session 10 and describes the OLD data model (Release, Playlist, UNLISTED,
> `artist` router, MediaProcessingJob, etc.). The PRD implementation log is at the very end ("PRD implementation log").

### Session 1 - Phase 0
- Created branch `refactor/single-nextjs-app`.
- Baseline: web had 6 type errors and 67 lint errors; express/worker typechecked clean.
- Fixed type errors; `tsconfig` now excludes `eslint.config.js` and sets `checkJs: false`.
- `next build` found an extra error `tsc` missed (stale `[song]` page); `next build` is the stricter check, keep it in CI.
- ESLint: disabled `prefer-nullish-coalescing` (changes `||` empty-string semantics), relaxed `no-floating-promises` for `*.test.ts`, fixed the rest by hand. Result: 0 errors, 31 warnings.
- Deleted dead code: `api/audio` (hardcoded Windows path), `/stream` demo page, `WaveAudioPlayer`, `Wavesurf`, `test-player`, `[song]` placeholder, `json-info`, and the `wavesurfer` deps. Removed the `react-scan@latest` unpkg script from the production layout.
- Web scripts: `lint` is plain `eslint .` (`next lint` needs env validation and is deprecated); added `check-types` and `test`. Removed broken `lint` scripts from express/media-worker (no ESLint config; both are being removed/moved).
- Added root `test` task and the CI workflow.
- **Next up: Phase 1.**

### Session 2 - Phase 1 + 2
- Environment: cloud container can reach R2 but **not Neon over TCP 5432** (only HTTPS egress; Neon's HTTPS host answers). Used the container's local Postgres 16 (`postgresql://streamer:streamer@localhost:5432/streamapp`, `service postgresql start`) with `prisma db push`. For Neon from here, Phase 6 should use `@prisma/adapter-neon` (HTTP/WebSocket on 443); from a normal machine / Vercel plain TCP works.
- `apps/web/.env` created locally (gitignored) from the environment variables; `BETTER_AUTH_SECRET` is a throwaway local value. **Still needed on Vercel**: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, plus the Google OAuth redirect URI.
- Ported stream/waveform/artwork/metadata to Route Handlers (see above), verified live against R2: 307 -> presigned URL -> `206` on range request; waveform 200; private -> 404; unlisted -> 307; play increments count.
- Removed: `apps/express`, `strream` tRPC router, legacy `store/playback.tsx` + `useKeyboardNavigation`, `jsonwebtoken`, `GOOGLE_GENERATIVE_AI_API_KEY`/`JWT_PLAYBACK_SECRET` from the env schema, `NEXT_PUBLIC_STREAM_API_URL`.
- URLs in the artist router are now same-origin (`/api/tracks/...`), via `trackUrls()`.
- Added `access.test.ts` (visibility rules). 12/12 tests, 0 lint errors, build OK.
- **Next up: Phase 3** (browser-side waveform at upload) then Phase 4 (hoist to root). The media-worker still works against the same DB/R2 for now.

### Session 2 (cont.) - Phase 3
- Browser-side analysis + server persistence as described in "Upload analysis". Verified in headless Chromium against real R2 (CORS on the bucket allows the presigned PUT from `localhost:3000`): 12 s tone -> `durationMs` 12000, 240 peaks, `AudioAnalysis.READY`, waveform served by `/api/tracks/:id/waveform`, cancel removes the waveform object + row, no worker job queued.
- `pnpm dev` now starts only the web app; `pnpm dev:worker` runs the media-worker for backfilling old tracks. The worker moves to `worker/` or gets deleted in Phase 4.
- Tests: 19 (new: peak computation, analysis schema, key layout).
- **Next up: Phase 4** (hoist `apps/web` to repo root, drop Turborepo/`packages/*`).

### Session 2 (cont.) - Phase 4
- Hoisted `apps/web/*` to the repo root with `git mv` (history preserved). Deleted `apps/media-worker` (Phase 3 made it redundant; this is a fresh app, nothing to backfill), `packages/*` (`@repo/ui` was unused; tsconfig base inlined; ESLint config was already local), `turbo.json`, `pnpm-workspace.yaml`, `TODO.md` and the stale `HANDOVER.md` (superseded by this file, `CONTEXT.md` and the ADR).
- `package.json`: name `music-stream-app`, `pnpm.onlyBuiltDependencies` allowlist (pnpm 10 skips build scripts otherwise), `test` is now a glob over `src/**/*.test.ts`, `dev:worker` removed. CI workflow unchanged and still valid.
- Verified: check-types, lint (0 errors), 19/19 tests, build.
- `.env` moved to the repo root (still gitignored). Remember to rebuild the Vercel project root to `/` (default).
- **Next up: Phase 5** (dependency upgrades, one commit each) or Phase 6 (Neon + Vercel) - recommend 6 first so there is a deployed baseline, then upgrade.

### Session 3 - Phase 6 prep
- Baseline migration `prisma/migrations/0_init` generated from the schema; verified on a fresh DB (`migrate deploy` then `migrate diff` = no difference). Local `streamapp` DB marked as applied. **Create Neon tables with `DATABASE_URL=<direct url> pnpm db:migrate`** (not `db:push`). From now on schema changes go through `pnpm db:migrate:dev`.
- Migrations use the direct URL; runtime on Vercel uses the pooled URL as `DATABASE_URL`. No `directUrl` in the datasource since Vercel never runs migrations.

### Session 3 (cont.) - Phase 5 + Neon merge
- Upgrades, one commit each, all verified with check-types/lint/test plus a runtime smoke test (pages, track routes, sign-up/in, headless-Chromium upload + analysis): in-range bumps; Better Auth 1.2 -> 1.7; Next 15 -> 16 (Turbopack default, native flat ESLint config, `import type` for `AppRouter`: with `verbatimModuleSyntax` an inline `{ type X }` import stays as a side-effect import and pulled server env into the client bundle under Turbopack); Prisma 6 -> 7.
- Removed dead three.js components + `three`/`@react-three/fiber`; `useTrackWaveform` no longer resets state inside an effect (new react-hooks rule).
- **Merged `master`** (user's Neon setup: `neon.ts`, `DATABASE_URL_UNPOOLED`, `@prisma/adapter-pg`, `0_init` migration identical to ours).
- **Prisma 7 layout**: generator `prisma-client` -> `src/generated/prisma` (gitignored, created by `postinstall`/`pnpm db:generate`); datasource URLs live in `prisma.config.ts` (CLI uses `DATABASE_URL_UNPOOLED ?? DATABASE_URL`, loads `.env` via dotenv); app + seeds build clients via `src/server/prisma-client.ts` (pg adapter, pooled URL). `migrate dev` no longer generates, so `pnpm db:migrate:dev` runs `prisma generate` after it.
- Correction: the pg adapter is enough for Neon on Vercel (pooled URL); a Neon-specific adapter would not help migrations from restricted networks, which use Prisma's schema engine over TCP.
- `@neon/env` is in package.json from the Neon setup but unused by the app code.

### Session 3 (cont.) - security / lockfile
- Vercel blocked the deploy of `master` ("Vulnerable version of Next.js"): master still has Next 15.3.1. This branch is on Next 16.4.6; merging it fixes that.
- `pnpm audit` showed 83 advisories even on this branch because `pnpm-lock.yaml` still carried phantom `apps/web` + `apps/media-worker` importers (pnpm kept them from `node_modules/.pnpm/lock.yaml` after the de-monorepo). Fix = delete `node_modules` and the lockfile, reinstall. Now 0 advisories; `effect` (Prisma CLI chain) is pinned via `pnpm.overrides` to `^3.22.1` (do NOT use `>=`, it jumps to an incompatible major and breaks `prisma generate`).
- Zustand 5 + zod 4 + lucide 1 verified at runtime (playback advances through the R2 redirect, form validation messages, createTrack).

### Session 3 (cont.) - Phase 7
- `artist.getTrack` now uses the same visibility rule as the stream route (`canAccessTrack`): unlisted tracks open via link, private tracks only for their creator (previously both 404ed on the detail page while the stream worked).
- Integration tests in `tests/integration/` (own `setup.ts` loaded via `node --import` so the app's db points at `TEST_DATABASE_URL`; refuses to run without it so dev/prod data is never touched; each test cleans up the users it created): concurrent publish of one asset (exactly one wins), cross-user asset rejected, pending asset rejected, rollback of the audio claim when artwork is not ready, release ordering + attach, release rollback with a foreign asset, duplicate file in one release, auth required, getTrack/listing visibility, Better Auth email sign-up/sign-in/duplicate. Not covered (needs R2 stub): cancel-vs-publish race.
- CI now has a Postgres 16 service, runs `pnpm db:migrate` then `pnpm test:integration`.
- Lint: 45 warnings -> 0 and `--max-warnings 0`. Decisions: shadcn `components/ui` exempt from `consistent-type-imports` (vendored); `@next/next/no-img-element` off because artwork is served from presigned R2 URLs that the Next image optimizer cannot cache usefully; removed dead `NowPlayingCard`.

### Session 4 - play counting
- `PlayEvent.clientHash` (+ index) via migration `1_play_event_client_hash` (hand-written, `migrate diff` shows no drift). **Run `pnpm db:migrate` against Neon (direct URL) before deploying code that includes it**, otherwise `/play` returns 500 (client ignores it, nothing else breaks).
- Plays are counted once per account or anonymous client per track per 30 min; the anonymous key is an HMAC (secret = `BETTER_AUTH_SECRET`) of ip + user agent, so no raw IP/UA is stored. Signed-in listeners are keyed by account only. The player reports a play after 5 s of playback (was: at load).
- Tests: unit (hash, ip parsing) + integration (repeat, distinct clients, account dedupe across devices, window expiry, 5 rounds x 40 concurrent requests, no raw ids stored). Mutation-checked: removing the advisory lock makes the concurrency test fail.
- Known limits: a bot rotating IPs and user agents can still inflate counts; real protection would need a rate limiter with shared state (Upstash/Vercel KV) or bot checks. Not worth it for a demo.

### Session 5 - CI + automatic dependency updates (ported from HyperGrapher/monarch-next-template)
- Adapted the template's workflows: shared composite actions `.github/actions/{setup,verify}`, `ci.yml`, `dependency-updates.yml` and `scripts/deps/*` (plan / apply / combine). Changes vs the template: default branch `master`; Node 22 and pnpm from `packageManager` (no workspace flag); Prisma instead of Payload (migrate on a throwaway DB + `prisma migrate diff --exit-code` drift guard; verified it fails with exit 2 on an unmigrated schema edit); lockstep groups `next`+`eslint-config-next`, `react`+`react-dom`, react types, tailwind pair, `prisma`+`@prisma/*`, `@trpc/*`; never auto-bump the major of `@types/node` (follows Node 22) and `typescript` (native-compiler major is adopted by hand).
- New Playwright suite (`tests/e2e`, 11 tests + 1 opt-in): `server.mjs` wipes the test DB, migrates, seeds fixed fixtures, builds and starts the app with dummy credentials; covers pages, visibility (public/unlisted/private incl. owner vs stranger), the stream redirect, play dedupe, auth. `upload-playback.e2e.spec.ts` (opt-in, real R2) runs the full creator journey and cleans its R2 objects. Safety: refuses to run if `TEST_DATABASE_URL` equals `DATABASE_URL(_UNPOOLED)`, and overrides both for the app it starts (prisma.config.ts prefers the unpooled URL).
- Better Auth's rate limiter (429 on repeated sign-ups) stays enabled in e2e; tests sign up once and share the session; the helper retries once after `x-retry-after`.
- Verified locally: whole verify sequence on a fresh DB (23 unit, 22 integration, 11 e2e); planner against the real registry (currently proposes eslint 10, a minor batch, lockfile refresh); apply/combine with simulated passing and failing candidates. NOT verified: the workflows on GitHub itself (cannot run Actions from here).
- Needs repo settings (GitHub -> Settings): Actions -> General -> "Allow GitHub Actions to create and approve pull requests" (for the PR fallback); optionally branch protection on `master` with the `test` check required. Pushes made by the dependency workflow use `GITHUB_TOKEN`, so CI does not re-run on them (the tree was just tested) but Vercel deploys them to production, where `vercel-build` applies pending migrations.

### Session 5 (cont.) - first production upload
- Upload on Vercel failed with a CORS error: the R2 bucket's CORS policy only allowed `localhost:3000`. Fix is bucket config, not code: allow `PUT` + `Content-Type` from `https://music-stream-app-2025.vercel.app` (Cloudflare dashboard -> R2 -> bucket -> Settings -> CORS policy). Add one origin per deployment domain you upload from.
- Also found while diagnosing: AWS SDK >= 3.729 defaults to `requestChecksumCalculation: "WHEN_SUPPORTED"`, which puts the CRC32 of an *empty* body into presigned PUT URLs (`x-amz-checksum-crc32=AAAAAA==`). R2 tolerated it but real S3 would reject every upload. `src/lib/r2.ts` now uses `WHEN_REQUIRED`; the real-R2 e2e test still passes.

### Session 6 - browsable site (home + discover)
- `discover` tRPC router (`tracks`: sort latest/popular, genre, search over title + creator name, limit <= 48; `genres`: public genres with counts) on top of `server/modules/tracks/discover.ts` (where/orderBy/select + the card DTO). Public tracks only; popular sorts by plays, likes, newest, id so ties are stable.
- UI: `TrackCard`/`TrackGrid` (artwork, creator link, plays, genre, hover play button; the grid becomes the player queue). `/` is now a real landing page (hero, Trending now when anything has plays, New releases, empty state) and was moved into the `(player)` route group, because outside it there was no player bar. `/discover` has sort tabs, genre chips and `?q=` search; filters live in the URL.
- Navbar: search box is a real GET form to `/discover?q=`; removed the dead Feed, Library, For Artists links and the non-functional Upgrade button; Discover stays visible on phones. Deleted the `/feed` stub.
- Tests: 7 integration (visibility, sorting incl. tie-breaks, genre, case-insensitive search that never matches private titles, limit bounds, DTO shape, genre counts) and 9 e2e (home, card navigation, no dead links, card play points the player at the stream URL, discover sorting/genre chips/search, navbar search). Learned: e2e must wait for hydration before clicking hover-revealed buttons.
- Visually checked desktop and phone screenshots against demo data.
- Not done: pagination beyond 48 results, search over tags/genre text, per-genre pages as separate routes (filters are query params).

### Session 6 (cont.) - README
- Rewrote `README.md` as a portfolio page: live demo + CI badge, screenshots (`docs/screenshots/*.jpg`, JPEG to keep the repo small; regenerate with a Playwright script against the demo data after UI changes), an honest "what works / not built yet" list, Mermaid architecture + upload + playback diagrams (rendered and validated), decisions table, stack, layout, local setup, env table, deploy checklist, tests/CI/dependency updates.
- `.env.example` rewritten: removed the media-worker variables, a personal Cloudflare dashboard URL and an email note, and the stale `directUrl` wording; `R2_PUBLIC_BASE_URL` is commented out (a placeholder URL would silently break artwork). The R2 account id remains in git history from older versions of that file; it is an identifier, not a credential.
- Keep the README claims in sync with reality when features land (likes, comments, playlists are listed as not built yet).

### Session 6 (cont.) - likes
- `engagement.setTrackLike({ trackId, liked })` (protected): idempotent like/unlike via `setTrackLike()` in `server/modules/tracks/likes.ts`. `likeCount` is incremented/decremented only by the number of rows `createMany(skipDuplicates)` / `deleteMany` really changed, in one transaction, so repeats and races cannot drift the counter. Visibility follows the stream rule (`canAccessTrack`; hidden tracks answer NOT_FOUND, anonymous callers UNAUTHORIZED). Tracks can be liked through an unlisted link.
- Read side: `likedByMe` on `artist.getTrack`, `getLatestTracks`, `getPopularTracks` and release tracks via `likedByMeSelect(viewerId)` (anonymous viewers match nothing), so pages render the right heart on first paint. Discover cards do not show likes.
- Client: `useTrackLike` (optimistic flip, server count replaces it, rollback + toast on error, "Sign in to like tracks" toast when signed out; state resyncs from props without an effect) and `LikeButton` (pill in lists, round in the track hero).
- Tests: 7 integration (idempotence, per-user counting, 20 parallel same-user requests, 12 concurrent distinct users, like/unlike storm, auth, private/unlisted rules, unknown ids, `likedByMe` per viewer across the queries) and 2 e2e (anonymous prompt; like/unlike with reload persistence, DB counter checked). Counter-equals-rows is asserted after every scenario.
- Known gap: deleting a user cascades their `TrackLike` rows but does not decrement `Track.likeCount` (no account-deletion feature exists yet; when it does, recount in the same transaction). Notifications for likes are not created yet.

### Session 7 - timed comments
- Uses the existing `Comment` model; no migration. `timestampSeconds Int?` = whole seconds into the track, null for a general comment. The client reads `usePlayerStore.getState().currentTime` **at the moment of posting** (not when typing starts), floors it, and only attaches it when this track is the one loaded in the player (a "Comment at m:ss" checkbox shows the live position and can be switched off). Finer than whole seconds would need a column change.
- Server (`server/modules/tracks/comments.ts`, router `comments`): `list` (newest 100 threads, replies oldest first, per-viewer `canDelete`; hidden tracks list nothing), `create`, `delete`. Rules: same visibility rule as streaming; content trimmed, 1-1000 chars; timestamp must be an integer within the track (0..ceil(duration), 4 h cap when duration is unknown) and is rejected on replies; replies are one level deep (a reply to a reply attaches to the root); at most 8 comments per author per minute (TOO_MANY_REQUESTS); authors and the track's creator may delete, anyone else gets FORBIDDEN; deleting a thread removes its replies and lowers `commentCount` by exactly the thread size (`GREATEST(0, ...)`).
- Consistency: create and delete take `pg_advisory_xact_lock(hashtextextended('comments:<trackId>'))` so `commentCount` always equals the rows. The random race (delete a thread while replies arrive) is too narrow to hit by brute force, so the test is deterministic: it holds the lock in the test and proves create and delete wait for it while other tracks do not. Mutation-checked: fails without the lock, passes with it.
- UI: `CommentsSection` (server prefetch + hydrated `useQuery`, so no loading flash; composer, threads, reply, delete with confirm), `CommentMarkers` (avatars under the hero waveform at `seconds / duration`), `usePlayAt` (load the track if needed, seek, play; a seek during loading is applied when the media is ready). Rendered as text (no HTML), `whitespace-pre-line`.
- Tests: 13 integration (exact second stored, whole-second/in-track validation, threading + root attachment, replies cannot be timed, visibility, rate limit, 24 concurrent posters, moderation, `canDelete` flags, thread deletion counts, lock contract) and 4 e2e (public view + waveform markers, general comment, **exact-second capture by seeking via an existing comment's chip then posting**, opt-out of the time, replies, deletion). The opt-in R2 test additionally plays real audio and asserts the stored second matches the player's position at the click.
- Known limits: no pagination beyond the newest 100 threads / 100 replies each; no edit; no comment likes (model exists); no notifications for new comments (model exists); deleting a user cascades their comments without adjusting `Track.commentCount` (same account-deletion caveat as likes).

### Session 8 - waveform rendering (branch `waveform`)
- Problem: long tracks rendered as a solid block. Each display bar took the **maximum** of the 50 ms windows it covered (about 14 per bar for a 3-4 min track at 2 px pitch); mastered music hits near full scale in almost every window, so every bar was full height. Short tracks (NiceFlex 1, 35 s, about 2 windows per bar) looked fine, which hid the bug.
- Fix (render-only, no data/format change, no backfill): `buildWaveformBars(peaks, barCount)` takes the RMS of the per-window peak amplitude over each bar's interval, normalises to the 99th-percentile bar (floor 0.04 so near-silence is not blown up) and interpolates when a track has fewer windows than bars. `WaveformVisualizer` draws 2 px bars every 3 px snapped to device pixels, so the bar count depends on the width only (about 260 for a 780 px waveform, close to SoundCloud).
- Chosen by rendering the real demo waveforms (max vs mean vs RMS, gamma 1 and 1.5) against SoundCloud screenshots of the same tracks: RMS with linear scaling matched the intros, breaks and ripple best; gamma 1.5 exaggerated drops. No library does this (wavesurfer.js / peaks.js also draw max peaks).
- Write-up with settings and how to tune or revert: [`docs/waveform-fix.docx`](waveform-fix.docx).
- Tests: 5 new unit tests (bar count independent of length, quiet passages survive transients, polarity, interpolation, silence). Verified check-types, lint, 27 unit, 26 e2e, and screenshots of the track page with the real waveforms.

### Session 9 - demo artwork
- The demo creator's old artwork files were deleted from R2 and replaced by a pool of 27 images at `random-artwork-images/artwork-001..027.webp` (bucket `music-stream-app`).
- Production data fix (one transaction, over Neon's HTTPS endpoint because port 5432 is blocked from the cloud sandbox): each of the 8 demo tracks got its own randomly chosen image as a new `IMAGE` asset (`ATTACHED`, `image/webp`), and the 2 old asset rows pointing at the deleted files were removed. Verified: every `/api/tracks/:id/artwork` on the live site redirects to a 200 `image/webp`, and `/discover` has no broken images.
- `prisma/seed-r2.ts` now takes artwork from that pool, shuffled so each new track gets a different image (checked on a throwaway local database: 10 tracks, 10 distinct images).

### Session 10 - artwork processing (sharp + srcset)
- Upload path unchanged for the browser (presigned PUT of the original). `markArtworkUploadComplete` now verifies the object, then `processArtworkObject` (sharp: auto-orient, centre-crop square, WebP q80, metadata stripped, inputs over 50 MP refused) writes `artworks/<userId>/<assetId>/{96,320,640}.webp`, points the asset at the largest rendition (`storageKey`, new `imageWidths Int[]`, migration `2_artwork_image_widths`) and deletes the original. Never upscales: a 462 px-short image gives 96/320/462. Keys derive from the asset id, so a duplicated call overwrites instead of leaking.
- Why 640: the largest artwork box is the track page hero (320 px from md up, full width below 768 px), so 640 covers desktop at 2x; on a portrait tablet a 640 image fills a ~720 px box, which is barely visible. Originals are deleted to keep R2 small (decision by the owner); larger sizes cannot be regenerated.
- Delivery: one `trackArtwork()` mapping (replacing 5 copies) returns `artworkUrl` (largest) + `artworkSrcSet`; `/api/tracks/:id/artwork?w=` redirects to a rendition. Presigned artwork URLs are signed at the start of an hour (`presignGetStable`) so they stay identical and the browser cache, plus the renditions' `immutable` Cache-Control, actually works. Every artwork `<img>` has `sizes` matching its CSS box (`ARTWORK_SIZES`). Legacy single-file images keep working without a srcset. The OS media-session artwork no longer claims to be a 512 px JPEG.
- Deleting an image asset (expired/cancelled uploads) removes all renditions.
- `pnpm artwork:backfill [--dry-run]` converts existing images; it deletes a source only when it is the owner's own upload (`artworks/<ownerId>/`), never the shared demo pool. `seed-r2` now makes renditions from the pool the same way.
- Tests: 7 unit tests (width planning, keys, srcset, real sharp renders incl. an EXIF-orientation test mutation-checked to fail without auto-orient, corrupt/oversized inputs), 1 integration test (srcset DTO for processed vs legacy artwork on discover and the track page), the opt-in real-R2 e2e now uploads a 1500x1000 JPEG through the form and asserts exactly the 3 renditions exist in R2 (original gone), each `?w=` serves an image of that size, and the browser picks the 320 rendition for the 320 px hero. Backfill exercised against real R2 with a local DB (own upload processed + deleted, pool source kept, second run a no-op). Verified: types, lint, 34 unit, 50 integration, 27 e2e.
- Production backfill is pending: it needs the migration, which Vercel applies on the production deploy after merge.

## PRD implementation log

### Session 11 - PRD M0 (foundation reset), branch `dev`
- Replaced the schema with PRD §16 and a fresh `0_init` baseline (old migrations deleted): Collection replaces Release/Playlist, Visibility = PUBLIC/PRIVATE/SCHEDULED + moderation, usernames, slugs + redirect tables, notifications/messages/reports/stats/rate-limit/storage-deletion tables, `Track.audioAssetId` no longer unique (demo audio is shared). Dropped `MediaProcessingJob`/`MediaProcessingError`, the detail waveform and `AudioAnalysis.QUEUED/PROCESSING`.
- New server modules: clock, names/slugs, visibility, entitlements, rate limiter, email, storage deletion queue, housekeeping + `/api/cron/daily`, image pipeline for avatars/banners, publishing, stats/recount (see the table at the top for locations).
- Auth: Better Auth `databaseHooks` generate a unique lowercase username at user creation (reserved words skipped, `_2` suffixes, recently renamed handles held for 30 days) and grant ADMIN to `ADMIN_EMAILS` at sign-up/sign-in; `username`/`role` are `input: false` (clients cannot set them).
- Behaviour changes versus before: you cannot like your own track (A3); private tracks cannot be liked even through a secret link; `markUploadComplete` requires the browser analysis (files the browser cannot decode are rejected); max audio size is 100 MB (entitlements); comment limits moved to the bucket limiter (8/min + 200/day); tRPC timing logs only in development.
- Ported UI/routes to permalinks (see "Pages" in the table), added the collection page, legacy redirects, `s-` secret routes, `noindex` for hidden content, canonical links. Removed `artist` router, `/track/[id]` page (now a redirect), `scripts/process-artwork.ts` and `artwork-backfill` (nothing to backfill on a fresh DB), `db:seed:r2`.
- Seed rewritten (`pnpm db:seed`), verified by running it twice against a local database and browsing the pages (screenshots checked: track page, album page).
- Verified locally on a fresh database: `check-types`, `lint` (0 warnings), 53 unit tests, 98 integration tests, 33 e2e tests, the opt-in real-R2 upload e2e (upload -> in-browser analysis -> publish -> play -> comment), `next build`, and `prisma migrate diff` shows no drift. NOT verified: the GitHub workflows themselves, the Vercel deployment, anything against Neon (the sandbox cannot reach it and was deliberately kept away from it).
- Learned: Better Auth rejects client-supplied `input: false` fields at sign-up and silently drops unknown ones; `tx`-scoped rate-limit upserts roll back with a rejected action, so only committed toggles count towards LK-3; running 20 parallel transactions that each need a second pooled connection can deadlock the pool, so keep helper writes inside the same `tx`.

### Session 12 - PRD M1 (accounts and profiles), branch `dev`
- Auth: email verification + reset wired to the email module (rate limited, no enumeration), password rules, change email, Google linking, session revoke via Better Auth client; `onboardedAt` extra field; `getSessionUser()` is the shell's source of truth.
- Server: accounts module (username check/rename with redirects and 30-day hold, image attach/replace, onboarding, deletion in two steps + cron purge), follow service, who-to-follow, profile list queries (activity/tracks/collections/likes/followers/following/spotlight), `verifiedProcedure`, `friendlyError()` as the single UI message mapping.
- UI: sign in/up pages + modal with action retry, forgot/reset/verify pages, three-step onboarding with the client guard, settings (5 pages), profile as real routes with paging, follow buttons, Home "Who to follow", navbar menu (profile, likes, following, settings).
- Tests: 18 new integration (follow concurrency/limits/blocks, usernames, onboarding, avatars, deletion + recount, verified gate, suggestions), 6 unit, 8 e2e (incl. J2 via the LOGGED verification email). Totals when this entry was written: unit 59, integration 116, e2e 41 (+1 opt-in R2), lint 0 warnings, types clean.
- Learned: `assert.rejects({cause:{...}})` does a deep comparison against the error class, so use predicate validators (`withAppCode`); Better Auth's `unlinkAccount` takes the account row id, not the provider; Playwright strict mode trips on `getByLabel("Password")` when a "Show password" button exists (use `exact`); the Next route announcer is also `role="alert"`; the cached session cookie lags DB changes by up to 5 minutes, so anything gating on it (onboarding, verification) must read the DB or merge server-resolved values (`AuthProvider` does).

### Session 13 - PRD M2 (upload and editing), branch `dev`
- Server: full field set, privacy/scheduling rules, upload-time quota (publish and verify), update/delete/replace-audio/secret reset, slug redirects, collection edit operations under advisory locks; `plans` router + `/settings/plan`.
- UI: new upload page with the Queued..Ready pipeline, single and release editors (dnd-kit, bulk actions, privacy warning), edit pages for tracks and collections, success/owner banners.
- Bugs found by the new tests and fixed: the sticky Save bar covered the Delete button at the bottom of the editors; the profile Albums/Playlists tabs rendered collections as tracks (M1 bug in `ProfileList`); `storage_deletion` update after a concurrent delete threw (now `updateMany`).
- Totals when this entry was written: unit 64, integration 140, e2e 49 (+1 opt-in R2), lint 0 warnings, types clean.
- Learned: tRPC batches calls issued in the same tick into one request (`/api/trpc/a,b`), so Playwright mocks must route on `upload.*` and answer per procedure; `getByLabel("Title")` matches labels that contain hint text only without `exact`; keyboard drag-and-drop in dnd-kit needs a short pause between key presses in Playwright.

### Session 14 - PRD M3 (listening), branch `dev`
- Server: related tracks, playlists (`mine`, `createPlaylist`), download route, play reporting with event ids + progress beacon, embed routes with frame headers.
- UI: queue model and player rewrite (shuffle, repeat, Next up, persistence, shortcuts, Media Session, tab sync), `TrackMenu`, add-to-playlist, share + embed dialogs, mobile tab bar / mini player / sheet, track and collection page completion, comment marker clustering and live bubble, `#t=` links.
- Bugs found by the new tests and fixed: `tracks.related` spread two `OR` keys into one `where` (the genre filter silently replaced the visibility filter, so private tracks leaked into suggestions); the e2e for the play route expected the old 204.
- Learned: zustand v5 selectors that return a fresh object need `useShallow` (infinite re-render otherwise); an Embed iframe needs `frame-ancestors *` on its own path while everything else keeps `'self'` (both set in `next.config.js`); real plays only register after ~5 s of listening, which e2e cannot reach without audio in storage, so e2e asserts queue state, not play rows.
- Totals when this entry was written: see the commit; unit 80, integration 145, lint 0 warnings, types clean e2e 53 + 1 skipped (+1 opt-in R2).

### Session 15 - PRD M4 (social loop), branch `dev`
- Also fixed first: the upload page had no visible publish action (a silently disabled "Save"); buttons are now Publish / Publish release / Publish all with an on-screen list of what is missing.
- Server: collection/comment likes, reposts with activity + notifications, notification write/read/email modules, feed, library, preferences, daily digest in the cron, unsubscribe route.
- UI: bell + page, feed, `/you/*` library, repost buttons, collection like/repost, comment upgrades.
- Learned: Next renders a page in parallel with its layout, so a layout `redirect` does not stop the page from running (guard in both); never put two `OR` keys in one Prisma `where` (the second replaces the first, so use `AND: [{ OR }, { OR }]`); `createTrack` in the integration helpers writes no `Activity`, so feed tests must create one.
- Totals when this entry was written: unit 80, integration 154, e2e 56 + 1 skipped, lint 0 warnings, types clean.

### Session 16 - PRD M5 (discovery), branch `dev`
- First: Vercel build failed with P1002 on `prisma migrate deploy` (the pooled Neon host does not support the migration lock); `prisma.config.ts` now derives the direct host when `DATABASE_URL_UNPOOLED` is missing (the owner also set it).
- Search (FTS + trigram migration `1_search`), recommendations, charts, tags, Home modules, Discover upgrades.
- Bugs found and fixed: `DiscoverGrid` kept the previous filter's tracks after a client navigation (now keyed by filters); an empty chart cached for 10 minutes would hide the first plays (empty results are not cached).
- Learned: the second migration is raw SQL (`prisma/migrations/1_search`); to apply it locally run `prisma migrate deploy` against both `streamapp` and `streamapp_test`. Never trust a SQL prefilter for visibility: re-load rows through the Prisma visibility builders.
- Totals when this entry was written: unit 86, integration 164, e2e 60 + 1 skipped, lint 0 warnings, types clean.
- Layout shift fix (before M6): Radix dropdown menus were modal, so opening one removed the page scrollbar (body scroll lock) and every `position: fixed` bar (player bar, mini player, tab bar) widened and jumped while the content stayed put (body gets padding). `DropdownMenu` is now non-modal by default (`components/ui/dropdown-menu.tsx`), and the fixed bars carry `right-scroll-bar-position`, the class react-remove-scroll uses to compensate fixed elements while a modal Dialog (share, add to playlist, auth) locks scroll. `tests/e2e/layout.e2e.spec.ts` guards it (it needs classic scrollbars, so it launches Chromium without `--hide-scrollbars`; headless Chromium otherwise has none and could never see this bug) and also checks cumulative layout shift < 0.1 on Home, Discover, Charts and a track page.
- CI fix: the schema-drift guard (`prisma migrate diff --exit-code`, in `.github/actions/verify`) failed because the trigram indexes of migration `1_search` were not in `schema.prisma`. They are now declared there (`@@index([title(ops: raw("gin_trgm_ops"))], type: Gin, map: "...")`); the full-text expression indexes cannot be modelled and Prisma ignores them. Rule: any index added by raw SQL that Prisma can express must also be declared in the schema, and run the diff locally (`prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` against a migrated database) before pushing a migration.

