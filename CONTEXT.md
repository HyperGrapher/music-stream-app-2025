# Music Streaming

This context covers publishing, organizing, discovering, and playing creator-uploaded music. The product
specification is [`docs/PRD.md`](docs/PRD.md); where this glossary and the PRD disagree, the PRD wins.

## Language

**Creator**:
A user who publishes tracks and collections. Every account is both a creator and a listener; there is no separate account type.
_Avoid_: Artist account, uploader

**Username / Permalink**:
A user's lowercase URL handle (`/{username}`) and the canonical URLs built from it: `/{username}/{trackSlug}` and `/{username}/sets/{collectionSlug}`. Old usernames and slugs keep redirecting (308).
_Avoid_: Profile id, track id in URLs

**Track**:
A single playable recording with its own metadata, visibility, permissions and engagement.
_Avoid_: Song, audio file

**Collection**:
An ordered set of tracks with a type: `PLAYLIST`, `ALBUM`, `EP`, `SINGLE` or `COMPILATION`. One model for what used to be separate releases and playlists; the type only decides presentation (the profile **Albums** tab shows the release types, **Playlists** shows playlists). A multi-file upload creates an `ALBUM`; the type can be changed at any time.
_Avoid_: Release, set, album as the generic term

**Media Asset**:
An owned audio, image, or generated waveform object that progresses `PENDING -> READY -> ATTACHED` (or is deleted). Images carry a purpose (`ARTWORK`, `AVATAR`, `BANNER`) and are stored as WebP renditions.
_Avoid_: Temporary upload, file key

**Audio Analysis**:
Duration, sample rate, channels and the generated waveform reference of one audio asset. Computed in the uploader's browser; a file the browser cannot decode is rejected.
_Avoid_: Track waveform JSON, dummy duration

**Visibility**:
`PUBLIC`, `PRIVATE` or (tracks only) `SCHEDULED`. A private item is reachable by its owner and by anyone holding its **secret link**. `SCHEDULED` becomes public when `publishAt` passes, evaluated at read time (no job flips it). Moderation (`REMOVED`) and the owner's account status further hide content. All decisions go through `server/modules/visibility`.
_Avoid_: Privacy boolean, unlisted (a separate state no longer exists: private + secret link replaces it)

**Secret link**:
A random 22-character token per track and per collection (`/…/s-{token}`). Resetting it invalidates the old link immediately. A collection's secret opens the owner's private tracks inside that collection.

**Plan / Entitlement**:
`FREE` or `PRO` (simulated, no billing). Every limit lives in `server/modules/plans/entitlements.ts`; no other code compares the plan directly.

**Play Event**:
A recorded listening session for a track: source, country, whether it was counted (owner plays are stored but never counted) and how much was heard. One counted play per listener per track per 30 minutes.
_Avoid_: Play count row, history item

**Reaction**:
A user's explicit like or repost of one concrete content type (track, collection or comment).
_Avoid_: Polymorphic engagement

**Activity**:
A feed row written when a creator publishes a track or collection (or reposts one). The following feed is `actorId IN following`.

**Storage Deletion**:
A durable queue of R2 objects to remove. Code that deletes an asset row enqueues its keys in the same transaction; `after()` hooks and the daily cron drain the queue. Shared demo media under `demo/` is never deleted.
