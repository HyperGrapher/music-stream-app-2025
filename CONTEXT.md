# Music Streaming

This context covers publishing, organizing, discovering, and playing creator-uploaded music.

## Language

**Creator**:
A user who publishes tracks and releases. A user may be both a creator and a listener.
_Avoid_: Artist account, uploader

**Track**:
A single playable recording with its own metadata, visibility, and engagement.
_Avoid_: Song, audio file

**Release**:
An ordered, creator-published collection of tracks presented as an album, EP, single, compilation, or set.
_Avoid_: Album as the generic term, playlist

**Playlist**:
An ordered, user-curated collection of tracks that can change independently of how those tracks were published.
_Avoid_: Release, album, set

**Media Asset**:
An owned audio, image, or generated waveform object that progresses from upload preparation or generation through verification to attachment.
_Avoid_: Temporary upload, file key

**Audio Analysis**:
Intrinsic metadata and generated waveform references derived from one audio media asset, including duration, codec, sample rate, channels, and processing state.
_Avoid_: Track waveform JSON, dummy duration

**Media Processing Job**:
A durable, retryable instruction for a worker to analyze one audio media asset and produce its waveform assets.
_Avoid_: Upload request callback, in-request processing

**Visibility**:
The audience allowed to discover or play content: public, private, or unlisted.
_Avoid_: Privacy boolean

**Play Event**:
A recorded listening session for a track, including progress and whether it qualified as a completed play.
_Avoid_: Play count row, history item

**Reaction**:
A user's explicit like or repost of one concrete content type.
_Avoid_: Polymorphic engagement
