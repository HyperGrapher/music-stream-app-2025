# SoundCloud: Upload, Releases, Profiles & Library Workflows

**Product UI/UX research report**  
**Research date:** 26 November 2026  
**Scope:** SoundCloud web experience, with mobile differences noted where the official documentation makes them clear.

> **How to read this report**  
> **Confirmed** means the behavior is described in SoundCloud’s current Help Center or official product documentation. **Interpretation** means the conclusion follows from those documented behaviors, but SoundCloud does not explain its internal data model. **UX recommendation** means a suggested workflow for a product that wants to provide a clear, predictable experience—not a claim about SoundCloud.

## 1. Executive summary

SoundCloud does not treat an album as a completely separate kind of object from a playlist in the creator workflow. The creator uploads audio tracks, groups them in a collection, and classifies that collection as **Playlist, Album, EP, Single, or Compilation**. Multiple tracks uploaded together are grouped as an album by default, but the creator can change the collection type afterward. A collection marked as Album, EP, Single, or Compilation appears in the profile’s **Albums** area; an ordinary playlist appears as a playlist.

The most important distinctions are:

- **A track is an individual audio upload.** It has its own title, artwork, description, genre/tags, privacy, permissions, URL, and playback page.
- **A playlist is an ordered collection of tracks.** It has its own title, artwork, description, privacy, genre/tags, and collection page. It can contain the creator’s tracks, other creators’ tracks, or a mixture.
- **An album/EP/single/compilation is a playlist collection with a release type.** The release type and release date determine that it is presented as a formal release in the profile’s Albums area.
- **A like is different from a playlist membership, repost, or offline download.** Liking a track saves that track to Likes. Liking a playlist or album saves the collection. Reposting shares it to the user’s profile and followers’ feeds. Offline saving is a separate SoundCloud Go feature.

### Quick answers

| Question | Finding |
|---|---|
| Can users upload several tracks at once? | Yes. On the desktop upload page, users can choose multiple files or drag and drop them together. |
| Does a multi-track upload become an album? | Yes, by default. It is not locked as an album: it can be changed to Playlist, EP, Single, or Compilation. |
| Can each uploaded track be renamed? | Yes, each track has its own title. Track metadata can be edited separately; Artist Studio also supports bulk track editing. Do not confuse the collection title with the individual track titles. |
| Can tracks be added to an album or playlist later? | Yes. Tracks can be added through the Add to Playlist control or from Artist Studio. The album is edited like a playlist collection. |
| Is an album a playlist? | In SoundCloud’s creator workflow, effectively yes: the same collection workflow has a Playlist type selector that includes Album, EP, Single, and Compilation. |
| Can users like a playlist or album? | Yes. SoundCloud’s like guidance covers tracks and playlists; albums use the playlist/release collection model. |
| Where are liked tracks found? | In the user’s Likes area inside Library. |
| Where are liked albums/playlists found? | In Library’s collection area (the precise category labels vary across web/app versions; SoundCloud documents liked and created playlists together, and describes Library as containing albums and playlists too). |
| What happens when a public track is uploaded? | It appears on the creator’s profile and can appear in followers’ Following feed and personalized Discover recommendations. |
| What happens after upload? | Mobile documentation says the saved track appears on the profile, sometimes while still processing. For desktop multi-track uploads, SoundCloud documents that the resulting collection can be opened and edited from its album page, but does not guarantee one universal post-upload redirect. |

## 2. The content model: track, playlist, album, EP, single, compilation

### 2.1 Track

A **track** is the individual audio item. It has its own playback page and waveform/player representation. It can have a separate title, artwork, artist credit, description, genre and tags, privacy setting, permalink, release date, advanced metadata, and permissions.

A track is not merely a row of text inside an album. It remains an individual item that can be opened and played directly, shared, liked (unless it is private or belongs to the current user), and managed separately. SoundCloud’s editing guide allows track details to be edited from the waveform’s pencil icon, from Artist Studio, or from the mobile app’s edit controls. [Track editing guide](https://help.soundcloud.com/hc/en-us/articles/46022345620123-Edit-and-customize-your-tracks)

### 2.2 Playlist

A **playlist** is a named collection of tracks. It can contain the creator’s own tracks and other users’ tracks. It has its own collection page, title, artwork, description, privacy, genre/tags, and track order. It is useful for mixes, DJ sets, mood collections, themed selections, or any sequence that is not intended to be presented as a formal release.

A playlist can be created from a track using the **+ / Add to Playlist** control, then **Create playlist**. The creator supplies a title, artwork, and description, and chooses whether it is public or private. Tracks can subsequently be added, removed, and rearranged. New tracks are added at the bottom by default; the creator can reorder them in the editor. [Playlist creation guide](https://help.soundcloud.com/hc/en-us/articles/115003452207-Creating-and-customizing-a-playlist) · [Track and playlist management](https://help.soundcloud.com/hc/en-us/articles/115003449787-Adding-Removing-and-Rearranging-Tracks-in-a-Playlist-or-Album)

### 2.3 Album, EP, Single, and Compilation

SoundCloud’s playlist editor provides a **Playlist type** selector with these choices:

- **Playlist** — a general-purpose collection.
- **Album** — a formal album release.
- **EP** — a formal EP release.
- **Single** — a formal single release. The single is represented as a release collection; it is not simply the fact that the uploader selected one file.
- **Compilation** — a formal compilation release.

SoundCloud says that multiple uploaded tracks create an album by default. The creator can open the resulting collection’s edit page and change the type to Playlist, EP, Single, or Compilation. The collection must have a release date when being marked as an Album; once saved, the release appears under the profile’s Albums tab. [Uploading Albums](https://help.soundcloud.com/hc/en-us/articles/46020284636443-Uploading-Albums)

**Interpretation:** It is useful to think of these as one collection system with a release-type field, rather than five unrelated content systems. The UI reinforces this: the same edit page has a type selector and a track list. This does not establish SoundCloud’s private database schema; it describes the creator-facing model.

### 2.4 Does uploading one track create a Single?

A normal one-file upload is an individual track. SoundCloud’s formal Single classification is available in the collection type selector. Therefore, a creator who wants a release to appear as a Single in the Albums area should use the release/collection workflow and classify it as **Single**, rather than assume that every standalone track is automatically a Single release.

### 2.5 Can an album also be treated as a playlist?

Yes, at the workflow level. SoundCloud explicitly explains that a multi-track upload is initially grouped as an album and can be changed into a playlist afterward. Conversely, an existing playlist can be changed into an album. An album therefore behaves like a playlist collection with a release classification and release metadata.

## 3. Upload workflow

### 3.1 Desktop: choose one or multiple files

The documented desktop path is:

1. Click **Upload** in the top navigation.
2. On the upload page, click **Choose files** or drag audio files onto the upload area.
3. Select one file for an individual track or several files for a grouped upload.
4. SoundCloud starts uploading and transcoding the selected audio.
5. Complete the track metadata and, for a multi-track upload, the collection/release information.
6. Save the track or collection with the desired privacy and permission settings.

SoundCloud’s current upload guide explicitly supports choosing or dropping one or more files. It notes that Basic and Artist accounts have upload-minute allowances, so an upload can be affected by the account’s remaining capacity. [Upload a Track, EP, or Album](https://help.soundcloud.com/hc/en-us/articles/46021990888219-Upload-a-Track-EP-or-Album-on-SoundCloud) · [Uploading FAQs](https://help.soundcloud.com/hc/en-us/articles/46022193845787-Uploading-FAQs)

![SoundCloud desktop upload page](https://help.soundcloud.com/hc/article_attachments/49358463517467)

*Official SoundCloud Help Center screenshot: the initial upload area supports drag-and-drop or the Choose files action.*

### 3.2 Batch upload: what the user is creating

When several files are selected together, SoundCloud groups them as an album by default. The uploader is therefore creating two related levels of information:

- **Track-level information** for each audio file.
- **Collection-level information** for the group that contains the tracks.

The user should not have to give every track the same title. Each track has its own title and can be edited independently. The collection has a separate title—for example, the album name. SoundCloud’s track-title guidance describes individual track titles and allows them to be edited through each track’s edit controls; Artist Studio also supports selecting and editing multiple tracks in bulk. The playlist editor’s Tracks tab manages the members and order of the group. [Track editing guide](https://help.soundcloud.com/hc/en-us/articles/46022345620123-Edit-and-customize-your-tracks) · [Playlist FAQ](https://help.soundcloud.com/hc/en-us/articles/46020168734235-Your-Playlists-FAQs)

**Track renaming:** Yes. A track title belongs to the track, not to the album. A user can rename an individual track without renaming the album. If the current batch-upload screen does not expose every per-track field inline, the user can edit the track afterward from its pencil/edit control or Artist Studio. SoundCloud documents the track-level edit capability; it does not fully specify in text whether every version of the multi-file upload UI exposes all track-title fields in one inline batch screen.

### 3.3 Track-level upload inputs

The current track-editing and upload guidance documents the following fields and controls. The exact grouping and visibility of advanced fields can vary by client, account tier, and whether the user is editing one track or a release.

| Input / control | Purpose | Notes |
|---|---|---|
| Artwork | Image representing the track | JPG/PNG; SoundCloud recommends at least 800 × 800 px and under 2 MB. Track artwork is independent of collection artwork. |
| Track title | The public track name | 1–100 characters; SoundCloud’s guidance says not to use emojis in titles. |
| Track permalink / URL | Custom public track address | Customizable on the web. |
| Main artist(s) | Artist credit | Defaults to the profile name; the Metadata tab can override the displayed artist name and add guest artists/collaborators. |
| Genre | Main category | The primary genre is used as the lead tag. |
| Tags | Subgenre, mood, topic, and discovery metadata | First tag is especially important; use specific, correctly formed terms. |
| Description | Track story, notes, links, credits | Up to 4,000 characters; full URLs are clickable, but HTML is not supported. `@username` can reference SoundCloud users. |
| Track privacy | Public, private, or scheduled where eligible | Public tracks can be discovered; private tracks do not appear on the public profile or SoundCloud search. Scheduled releases are a plan-dependent feature and SoundCloud documents them for individual tracks, not playlists. |
| Release date | Date associated with the track | Available in track metadata/advanced details. |
| ISRC | Recording identifier | Advanced metadata for professional cataloguing. |
| Record label / publisher | Release and rights metadata | Available in Metadata or Advanced details, depending on the editor. |
| Buy link | External purchase link | Can point to a store, Bandcamp, or the artist’s website. |
| Audio preview clip | Select the 30-second excerpt used in feed/social previews | If not selected, SoundCloud may automatically choose a snippet. |
| License | Rights and reuse terms | All Rights Reserved or an available Creative Commons license. |
| Permissions | Listener capabilities | Downloads, comments/stat visibility (Quiet Mode where eligible), app playback, embeds, and offline-listening settings. |

Sources: [Track upload/edit metadata](https://help.soundcloud.com/hc/en-us/articles/46022345620123-Edit-and-customize-your-tracks), [track upload preview/feed behavior](https://help.soundcloud.com/hc/en-us/articles/18440849363867-How-the-Feed-on-SoundCloud-Works), [playlist permissions](https://help.soundcloud.com/hc/en-us/articles/45697254429595-Managing-permissions-when-uploading-a-playlist), and [playlist licensing](https://help.soundcloud.com/hc/en-us/articles/115003562748-Choosing-a-license-for-your-playlist).

### 3.4 Collection-level inputs for a multi-track upload

A batch upload also needs details for the collection. SoundCloud’s playlist editor is organized into **Basic info**, **Tracks**, and **Metadata** tabs in its documented interface examples.

![SoundCloud playlist type selector](https://help.soundcloud.com/hc/article_attachments/46964492822171)

*Official SoundCloud Help Center screenshot: Basic info includes collection title, permalink, playlist type, release date, description, and privacy.*

| Input / control | Purpose | Notes |
|---|---|---|
| Collection artwork | Cover image for the album/EP/playlist | JPG/PNG; SoundCloud recommends at least 800 × 800 px and under 2 MB. Changing collection artwork does not automatically replace artwork on every track. |
| Collection title | Album, EP, compilation, or playlist title | Separate from each track title. |
| Collection permalink | Public URL for the collection | Can be customized from the web edit page. |
| Playlist type | Playlist / Album / EP / Single / Compilation | Determines whether it appears as a formal release in the profile’s Albums area. |
| Release date | Official release date | Required when converting a collection to an Album; a playlist can also carry release-date/label information. |
| Genre | Main collection genre | Used for discovery and may be applied to tracks in the uploaded playlist. |
| Additional tags | Mood, subgenre, and descriptors | Playlist upload guidance says tags are attached to the playlist and tracks within it. |
| Description | Release notes, credits, context | Separate from each track’s description. |
| Privacy | Public or private collection | The collection’s privacy does not automatically change the privacy of the tracks inside it. |
| Record label / publisher | Label or release metadata | Playlist metadata supports record-label and release-date details. |
| License | Rights/reuse terms | Can be set through the collection’s Metadata tab for tracks within the collection. |
| Track list | Track membership and order | Tracks can be rearranged, removed, or added later. |

SoundCloud’s official playlist metadata screenshot also shows a **Genre** field and **Additional tags**. Its help guidance says these collection tags are attached to the playlist and the tracks within it. [Playlist genre and tags](https://help.soundcloud.com/hc/en-us/articles/115003446007-Adding-a-genre-and-tags-when-uploading-a-playlist)

![SoundCloud playlist genre and tags](https://help.soundcloud.com/hc/article_attachments/39997092497179)

*Official SoundCloud Help Center screenshot: genre and additional tags are collection-level metadata.*

### 3.5 Permissions and privacy are not the same as release type

A collection can be public or private, but the tracks inside it also have their own privacy states. SoundCloud explicitly warns that making a playlist public does not make private tracks inside it visible. If the collection is public while some tracks are private, listeners will not be able to view those private tracks. The creator must manage both levels deliberately. [Playlist privacy settings](https://help.soundcloud.com/hc/en-us/articles/115003447187-Changing-your-playlist-s-privacy-settings) · [Track and playlist management](https://help.soundcloud.com/hc/en-us/articles/115003449787-Adding-Removing-and-Rearranging-Tracks-in-a-Playlist-or-Album)

This is an important edge case for a multi-track upload: the release container and each audio item should have compatible visibility if the intention is to publish the full album.

## 4. What users can do after creating a collection

### 4.1 Add more tracks

A creator can add tracks to a playlist or album after the initial upload. On the web, a user can go to the track and use the **+ / Add to Playlist** action, or open the track’s three-dot menu and select **Add to Playlist**. Artist Studio also provides collection creation/management actions. SoundCloud’s playlist FAQ explains that tracks can be selected and added to a new or existing playlist. [Adding tracks to a playlist or album](https://help.soundcloud.com/hc/en-us/articles/115003449787-Adding-Removing-and-Rearranging-Tracks-in-a-Playlist-or-Album)

### 4.2 Rename the collection or change its type

The collection’s title, permalink, artwork, description, privacy, type, release date, genre, and tags can be edited on the collection page via its pencil/edit control. On the web, the title and URL can be changed through the edit page; SoundCloud’s FAQ notes that playlist renaming is not currently available in the mobile app. [Playlist customization](https://help.soundcloud.com/hc/en-us/articles/115003452207-Creating-and-customizing-a-playlist)

### 4.3 Reorder or remove tracks

On web, open the playlist/album editor and use the Tracks tab to drag tracks into the desired order or remove tracks. On mobile, the playlist editor also supports drag-and-drop reordering. New items are normally appended to the bottom before being rearranged. SoundCloud recommends keeping collections to around 250 tracks for easier loading in one guide, while its playlist FAQ states a hard playlist limit of 500 tracks. [Track management](https://help.soundcloud.com/hc/en-us/articles/115003449787-Adding-Removing-and-Rearranging-Tracks-in-a-Playlist-or-Album) · [Playlist FAQ](https://help.soundcloud.com/hc/en-us/articles/46020168734235-Your-Playlists-FAQs)

### 4.4 Privacy and permissions

- A public collection can appear on the creator’s public profile and followers’ feeds.
- A private collection is not shown on the public profile or in SoundCloud search; access is controlled through its private/secret link.
- Public collection visibility does not override private track visibility.
- Track downloads can be enabled, but SoundCloud does not offer a single download of the entire playlist; downloads are per-track.
- Permission options include downloads, embeds, app playback restrictions, offline listening for eligible Go users, and Quiet Mode controls for eligible Artist Pro accounts.

Sources: [Collection privacy](https://help.soundcloud.com/hc/en-us/articles/115003447187-Changing-your-playlist-s-privacy-settings) · [Playlist permissions](https://help.soundcloud.com/hc/en-us/articles/45697254429595-Managing-permissions-when-uploading-a-playlist)

## 5. How tracks and releases appear to other users

### 5.1 A single track on the artist profile

A public standalone track appears in the creator’s profile track stream. The track is shown as an individual player/list item, typically with its artwork, title, artist, waveform/player controls, and engagement actions. Opening it leads to its dedicated track page.

SoundCloud documents that the order of tracks on the profile is chronological, based on the first time each track was made public. The newest public track appears at the top. Creators cannot freely drag tracks into a preferred order in the profile stream. Spotlight is the premium exception for pinning selected items. [Rearrange tracks](https://help.soundcloud.com/hc/en-us/articles/1260801673729-Rearrange-tracks)

### 5.2 An album or EP on the artist profile

When a playlist collection is changed to Album, EP, Single, or Compilation and saved, SoundCloud says it appears under the **Albums** tab on the creator’s profile. It is presented as a release/collection with its cover artwork and title; opening it reveals the ordered track list and allows playback of the tracks in the collection.

A collection that remains type **Playlist** belongs in the profile’s playlists area rather than the formal Albums area. This is the practical difference between uploading several files and intentionally publishing a formal release.

### 5.3 Profile navigation and presentation

SoundCloud profile layouts have included sections/tabs such as **All**, **Popular tracks**, **Tracks**, **Albums**, **Playlists**, and **Reposts**. Exact labels and availability can vary by app, account, profile layout, and product updates. The stable conceptual distinction is:

- **All:** combined profile activity/content view; Spotlight items may be pinned here.
- **Popular tracks:** a popularity-oriented view of tracks.
- **Tracks:** individual uploads.
- **Albums:** formal release collections (Album, EP, Single, Compilation).
- **Playlists:** general playlists/curated collections.
- **Reposts:** tracks and playlists the creator has reposted.

SoundCloud’s current Help Center confirms the profile as the public hub for uploaded tracks and reposts, confirms the Albums tab for typed releases, and documents Spotlight. The wider tab list is visible in SoundCloud profile examples and may evolve. [Anatomy of SoundCloud](https://help.soundcloud.com/hc/en-us/articles/115003570748-Anatomy-of-SoundCloud) · [Artist profile customizations](https://help.soundcloud.com/hc/en-us/articles/10199928919963-Artist-Profile-Customizations)

### 5.4 Spotlight / pinned content

Eligible Artist plans can pin selected public tracks or playlists near the top of the profile using **Spotlight**. SoundCloud currently documents a limit of one item for Artist and up to five for Artist Pro. Spotlight is useful when the creator wants a newly released album, signature track, or important playlist to remain prominent regardless of chronological ordering. [Artist profile customizations](https://help.soundcloud.com/hc/en-us/articles/10199928919963-Artist-Profile-Customizations)

### 5.5 Main page, Following feed, and Discover

The artist profile and the listener’s Home/Feed are different destinations:

- **Profile:** the creator’s persistent public catalogue and identity page.
- **Following feed:** new releases and reposts from accounts the listener follows. Public uploads and reposts appear in followers’ Following feeds.
- **Discover feed:** personalized recommendations based on similarity to tracks the listener already listens to and likes. SoundCloud says public tracks can be recommended here.

On mobile, SoundCloud documents separate **Discover** and **Following** feed tabs. On web, Feed is documented primarily as the Following feed. Public tracks can be shown with a 30-second preview that links to the full track. The creator can select the preview during upload via Advanced settings; otherwise SoundCloud may choose one automatically. The artwork selected for the track is used in the feed, or the profile picture is used if no track artwork is supplied. [How the Feed works](https://help.soundcloud.com/hc/en-us/articles/18440849363867-How-the-Feed-on-SoundCloud-Works)

Public playlists are also pushed to followers’ feeds. For an album/release collection, this follows from SoundCloud’s treatment of albums as playlist collections; the exact feed card treatment may differ by surface. Ensure that the collection and its member tracks are public if the goal is for followers to hear the complete release. [Playlist and album track management](https://help.soundcloud.com/hc/en-us/articles/115003449787-Adding-Removing-and-Rearranging-Tracks-in-a-Playlist-or-Album) · [Playlist privacy](https://help.soundcloud.com/hc/en-us/articles/115003447187-Changing-your-playlist-s-privacy-settings)

### 5.6 Search and discovery

SoundCloud Search separates **Tracks**, **People/Profiles**, **Albums**, and **Playlists**. An album is therefore discoverable as an album result, while a normal playlist is discoverable as a playlist result. Genre and tags can help users find tracks and playlists. [Search on SoundCloud](https://help.soundcloud.com/hc/en-us/articles/115003568168-Search-on-SoundCloud)

## 6. Likes, saving, reposts, and the Library

These actions can look similar because they all help a user keep or share content, but they have different effects.

### 6.1 Like a track

The user clicks/taps the heart on a track. The heart changes from grey to orange, and the track is added to the user’s Likes. The user can later open Library and find the item in the liked-tracks area, or play/shuffle the Likes collection.

SoundCloud notes two restrictions: users cannot like private tracks, and users cannot like their own uploaded tracks. It also enforces limits on repeated like/unlike actions. [Your Likes & Playlists](https://help.soundcloud.com/hc/en-us/articles/115003568968-Your-Likes-Playlists)

### 6.2 Like an album or playlist

SoundCloud’s like workflow applies to playlists as well as tracks. Since an album/EP/single/compilation uses the playlist collection model, the user can like the **collection itself** using its heart control. That saves the release as a collection rather than requiring the listener to like every track individually.

A collection like and an individual track like should be treated as separate user actions. Liking the album is not the same as liking every track inside it. A listener who wants selected tracks in their personal Likes list can like those tracks individually as well.

### 6.3 Where saved content is found

The central destination is **Library**. SoundCloud describes Library as the user’s personal collection of liked tracks, playlists, albums, and followed artists. It also explains that liked or created playlists can be viewed from the Library playlist area. The UI labels and exact tabs can vary between web and app versions, but the underlying mental model is:

- **Likes / liked tracks:** individual tracks the user has hearted.
- **Albums:** album/release collections the user has liked or saved, where this category is surfaced separately.
- **Playlists:** liked and created playlists/collections.
- **Artists:** profiles the user follows.

If a user has liked an album and cannot find it under a tab literally named “Likes,” they should check the Library’s album/playlist collection area. The Help Center’s descriptions are not fully consistent about whether every client labels saved albums separately from playlists, so avoid hard-coding a single tab label across platforms. [Your Library & Feed](https://help.soundcloud.com/hc/en-us/articles/115003566308-Your-Library-Feed) · [Your Playlists FAQs](https://help.soundcloud.com/hc/en-us/articles/46020168734235-Your-Playlists-FAQs)

### 6.4 Add a track to a personal playlist instead of liking it

The user can add a track to a new or existing playlist using the **+ / Add to Playlist** control or track menu. This is useful when the user wants intentional organization—for example, “Late-night drive”—rather than a chronological Likes list. A user can also create a playlist containing tracks from several artists. [Creating and customizing a playlist](https://help.soundcloud.com/hc/en-us/articles/115003452207-Creating-and-customizing-a-playlist)

### 6.5 Repost is not a like

A repost shares a track or playlist to the user’s profile and followers’ feeds. It is a social distribution action, not simply a private bookmark. Reposting does not create a new copy of the audio. SoundCloud says users cannot repost their own tracks. [Repost Tracks & Playlists](https://help.soundcloud.com/hc/en-us/articles/115003567488-Repost-Tracks-Playlists)

### 6.6 Offline saving is different again

For eligible SoundCloud Go subscribers, the app can save tracks, Likes, and playlists for offline listening. This uses a download/offline control separate from the heart. Saving something offline is not the same as liking it, and liking a playlist does not automatically mean that it has been downloaded to the device. [Offline Listening with SoundCloud Go](https://help.soundcloud.com/hc/en-us/articles/31354612612763-Offline-Listening-with-SoundCloud-Go)

### 6.7 Social discovery through Likes

SoundCloud’s **Liked By** feature can show profile pictures of people the listener follows next to tracks those people have liked. This creates social discovery across playlists, search results, track lists on artist pages, Home feed, and liked tracks. A user’s likes can therefore function as both a personal library and a social signal. [Liked By](https://help.soundcloud.com/hc/en-us/articles/38293355919259-Liked-By)

## 7. Where the user goes after uploading

### 7.1 What SoundCloud documents

- **Mobile single-track upload:** after the user taps Save, the track appears on the user’s profile. It may show a processing indicator while SoundCloud transcodes the file. [Upload using the SoundCloud App](https://help.soundcloud.com/hc/en-us/articles/360043080874-Upload-using-the-Soundcloud-App)
- **Desktop multi-track upload:** SoundCloud says the several uploaded tracks are grouped as an album by default. After it has been uploaded and saved, the creator can open the album page and use the pencil icon to edit the collection type and other information. [Uploading Albums](https://help.soundcloud.com/hc/en-us/articles/46020284636443-Uploading-Albums)
- **Exact immediate redirect:** the current official upload documentation does not promise that every desktop upload redirects to one universal destination. The post-save screen can be client- and flow-dependent; do not assume a specific redirect solely from the Help Center text.

### 7.2 Recommended post-upload workflow (UX recommendation)

A strong and predictable product flow would be:

1. **Keep the uploader open while uploads process.** Show a per-file progress state, a processing/transcoding state, and clear failures/retry actions. Do not imply that the file is playable before processing is complete.
2. **For one track, go to the track detail page after save.** Show the published/private status and clear actions to edit metadata, copy/share the link, view the profile, or upload another track.
3. **For multiple tracks, go to the new collection page or a collection review screen.** Show the collection artwork/title and all child tracks, with track-level editing readily available. The primary next step should be “View release” or “Finish release details,” not a generic route that makes the user hunt for their upload.
4. **Make release classification explicit.** Offer Playlist, Album, EP, Single, and Compilation with short explanations. If the default is Album, tell the user that this is only a default and can be changed.
5. **Show two privacy levels clearly.** Display collection privacy and each track’s privacy, and warn when a public collection contains private tracks.
6. **Offer three useful next actions:** View release, Edit tracks/details, and Upload another. Provide a link to the profile as a secondary action.
7. **Preserve context.** After editing an album’s metadata, return the user to that album page rather than sending them back to a generic upload dashboard.

This flow is a recommendation based on the documented SoundCloud object model and common creator expectations. It is not a claim that SoundCloud currently uses precisely these post-upload screens.

## 8. Practical workflow diagrams

### 8.1 One-track upload

```text
Upload
  → Choose one audio file
  → Upload + transcode
  → Enter track title / artwork / artist / genre / tags / description
  → Set privacy, preview, licensing, and permissions
  → Save
  → Track appears on creator profile
  → Public track can appear in Following and Discover
```

### 8.2 Multi-track album/EP upload

```text
Upload
  → Choose multiple audio files
  → Upload + transcode each track
  → Edit each track's own title and metadata
  → Review track order
  → Add collection artwork and collection title
  → Choose type: Playlist / Album / EP / Single / Compilation
  → Add release date, genre/tags, description, privacy, metadata, permissions
  → Save collection
  → Collection page / profile Albums or Playlists area
  → Individual tracks remain independently playable and editable
```

### 8.3 Like and find later

```text
Track page or player
  → Heart track
  → Track appears in Likes / Library

Album or playlist page
  → Heart collection
  → Collection appears in Library's album/playlist area

Optional: Add a track to a playlist
  → + / Add to Playlist
  → Choose existing playlist or Create playlist
```

## 9. Additional details worth accounting for

### 9.1 Artwork is separate at the track and collection levels

The collection has its own cover image, and individual tracks have their own artwork. SoundCloud explicitly notes that changing playlist artwork does not automatically change the artwork on all tracks inside it. A good upload UI should make it obvious whether the user is changing the whole release cover or one track’s image.

### 9.2 Track and collection ordering are different

Tracks in a playlist or album can be reordered. Standalone tracks in the creator’s profile stream are chronological and cannot be manually rearranged. Spotlight is the premium mechanism for pinning selected items at the top of the profile. [Rearrange tracks](https://help.soundcloud.com/hc/en-us/articles/1260801673729-Rearrange-tracks)

### 9.3 Release date is meaningful

A release date is not just decorative text. SoundCloud requires one when a collection is changed to Album, and supports adding a label/release date to a playlist collection. The Help Center notes that playlist release dates use GMT, so a date can appear to differ for users in other time zones. [Uploading Albums](https://help.soundcloud.com/hc/en-us/articles/46020284636443-Uploading-Albums) · [Record label and release date](https://help.soundcloud.com/hc/en-us/articles/115003446527-Adding-a-record-label-and-release-date-to-your-playlist)

### 9.4 Tags and genre apply to the collection and its tracks

SoundCloud’s playlist tagging guide says playlist genre/tags are attached to the playlist and tracks within it. It recommends using the first/main tag accurately, since it can be used as the main genre and appear in feed/search contexts. The guide notes that tags are currently compatible with English characters. [Playlist genre and tags](https://help.soundcloud.com/hc/en-us/articles/115003446007-Adding-a-genre-and-tags-when-uploading-a-playlist)

### 9.5 Downloads are track-level, not whole-album downloads

SoundCloud permits downloads to be enabled through permissions, but states that it does not offer downloads of entire playlists. Individual tracks can be downloaded when the creator enables the option and the listener is signed in. [Playlist permissions](https://help.soundcloud.com/hc/en-us/articles/45697254429595-Managing-permissions-when-uploading-a-playlist)

### 9.6 Basic vs premium features and upload allowance

Some controls are plan-dependent. SoundCloud’s current documentation describes upload-minute allowances for Basic and Artist tiers and unlimited upload capacity for Artist Pro. Some features—such as scheduled releases, more advanced profile Spotlight capacity, Quiet Mode, downloads, or offline listening—can depend on plan or eligibility. Because plan names, regional availability, and quotas can change, check the current pricing/help pages before implementing hard-coded limits. [Upload FAQs](https://help.soundcloud.com/hc/en-us/articles/46022193845787-Uploading-FAQs) · [Artist profile customizations](https://help.soundcloud.com/hc/en-us/articles/10199928919963-Artist-Profile-Customizations)

### 9.7 Public vs private content should be explained carefully

A private track or playlist does not appear on the public profile or in SoundCloud search. Private sharing is controlled using a secret link. Also, a public playlist with private tracks can appear public while some of its contents remain unavailable to listeners. This deserves a clear warning at publish time.

## 10. UX recommendations if you are designing a similar product

The following recommendations are distilled from the SoundCloud workflow, with an emphasis on reducing confusion for creators.

### 10.1 Treat upload as a two-level editor

Use two clearly separated areas:

- **Release details:** artwork, title, release type, release date, description, tags, privacy, label, and collection-level permissions.
- **Track list:** one row/card per audio file with its own artwork, title, artist credit, genre/tags, description, privacy, and per-track settings.

Keep the release title visually distinct from track titles. For a five-track album, the user should immediately understand that “Night Drive” is the release title and “Blue Hour,” “Afterglow,” and the other names are individual songs.

### 10.2 Use a track list with expandable per-track editing

For each file, show:

- drag handle and track number;
- artwork thumbnail;
- editable track title;
- artist credit;
- duration and upload/transcode state;
- a small “Edit details” disclosure for additional metadata;
- a remove action.

Allow bulk actions for shared fields such as artist name, genre, tags, and privacy, but do not force one value across every track. Preserve individual overrides.

### 10.3 Make release type understandable

Use a dropdown or segmented choice with plain-language helper text:

- Playlist — “A collection or mix of tracks.”
- Album — “A full-length release.”
- EP — “A shorter multi-track release.”
- Single — “A standalone single release.”
- Compilation — “A collection of tracks grouped as a compilation.”

Do not make the user guess whether multiple files automatically mean “Album.” If you default to Album, explain that the user can change it before publishing.

### 10.4 Validate the parent and child privacy together

If the user selects Public for the collection but one or more tracks are Private, show a warning such as: “This release is public, but 2 tracks are private and won’t be playable by listeners.” Offer a bulk action to make all tracks public, while allowing per-track exceptions.

### 10.5 Separate “Like,” “Add to playlist,” “Repost,” and “Download”

These are four distinct jobs:

- **Like:** save this track or collection to my library and signal appreciation.
- **Add to playlist:** organize this track inside one of my own collections.
- **Repost:** share this content with my followers and profile visitors.
- **Download / Save offline:** keep a local/offline copy when the creator and plan allow it.

Use labels or tooltips when icons alone could be ambiguous.

### 10.6 Make the collection page a useful destination

After multi-track upload, present a release page that clearly shows artwork, title, type, release date, full track list, and playback controls. Add clear entry points for “Edit release,” “Edit track,” “Share,” and “View profile.” Do not force creators to visit separate pages just to correct each track title.

### 10.7 Provide robust upload feedback

Uploads and transcoding are separate phases. Distinguish:

- Waiting to upload;
- Uploading bytes;
- Processing/transcoding;
- Ready to play;
- Failed, with retry;
- Published or private.

For multi-file uploads, show progress and errors per track, plus overall batch progress. A single failed file should not silently invalidate the other successful uploads.

### 10.8 Keep library destinations predictable

Use a stable Library hierarchy with explicit categories such as Liked tracks, Albums, Playlists, Artists, and Downloads. If albums are technically playlists behind the scenes, still surface them in an Albums area when the user has classified them as releases. That matches the creator’s mental model and SoundCloud’s profile distinction.

## 11. Confidence and limitations

- **High confidence:** multi-file upload support; multi-file uploads default to album grouping; playlist type options; album/EP/single/compilation appearing in Albums; track and playlist metadata; liking tracks/playlists; private/public behavior; profile/feed principles; playlist editing and reordering.
- **Moderate confidence:** the exact appearance of every field in the current batch-upload editor. SoundCloud documentation establishes the fields and the collection tabs, but not every account/client variation in a single written walkthrough.
- **Not established by official documentation:** one universal immediate desktop redirect after every upload. The report therefore states what SoundCloud documents and gives a clearly labeled UX recommendation rather than inventing a guaranteed redirect.
- **Client differences:** mobile upload help describes selecting and saving a track, while the desktop upload guide explicitly documents selecting multiple files. Do not assume every mobile upload flow offers the same batch-release editor as desktop.
- **Terminology/placement:** Library labels and profile tabs can change over time or differ by app/web surface. The underlying content relationships are better documented than every exact navigation label.

## 12. Official sources

All primary sources below are SoundCloud Help Center or SoundCloud product pages. They were reviewed on **26 November 2026**; SoundCloud can change its interface and documentation later.

1. [Upload a Track, EP, or Album on SoundCloud](https://help.soundcloud.com/hc/en-us/articles/46021990888219-Upload-a-Track-EP-or-Album-on-SoundCloud)
2. [Uploading Albums](https://help.soundcloud.com/hc/en-us/articles/46020284636443-Uploading-Albums)
3. [Uploading FAQs](https://help.soundcloud.com/hc/en-us/articles/46022193845787-Uploading-FAQs)
4. [Edit and customize your tracks](https://help.soundcloud.com/hc/en-us/articles/46022345620123-Edit-and-customize-your-tracks)
5. [Your Playlists FAQs](https://help.soundcloud.com/hc/en-us/articles/46020168734235-Your-Playlists-FAQs)
6. [Creating and customizing a playlist](https://help.soundcloud.com/hc/en-us/articles/115003452207-Creating-and-customizing-a-playlist)
7. [Adding, Removing and Rearranging Tracks in a Playlist or Album](https://help.soundcloud.com/hc/en-us/articles/115003449787-Adding-Removing-and-Rearranging-Tracks-in-a-Playlist-or-Album)
8. [Adding a genre and tags when uploading a playlist](https://help.soundcloud.com/hc/en-us/articles/115003446007-Adding-a-genre-and-tags-when-uploading-a-playlist)
9. [Adding a record label and release date to your playlist](https://help.soundcloud.com/hc/en-us/articles/115003446527-Adding-a-record-label-and-release-date-to-your-playlist)
10. [Managing permissions when uploading a playlist](https://help.soundcloud.com/hc/en-us/articles/45697254429595-Managing-permissions-when-uploading-a-playlist)
11. [Changing your playlist’s privacy settings](https://help.soundcloud.com/hc/en-us/articles/115003447187-Changing-your-playlist-s-privacy-settings)
12. [Choosing a license for your playlist](https://help.soundcloud.com/hc/en-us/articles/115003562748-Choosing-a-license-for-your-playlist)
13. [Your Likes & Playlists](https://help.soundcloud.com/hc/en-us/articles/115003568968-Your-Likes-Playlists)
14. [Your Library & Feed](https://help.soundcloud.com/hc/en-us/articles/115003566308-Your-Library-Feed)
15. [Anatomy of SoundCloud](https://help.soundcloud.com/hc/en-us/articles/115003570748-Anatomy-of-SoundCloud)
16. [How the Feed on SoundCloud Works](https://help.soundcloud.com/hc/en-us/articles/18440849363867-How-the-Feed-on-SoundCloud-Works)
17. [Artist Profile Customizations](https://help.soundcloud.com/hc/en-us/articles/10199928919963-Artist-Profile-Customizations)
18. [Repost Tracks & Playlists](https://help.soundcloud.com/hc/en-us/articles/115003567488-Repost-Tracks-Playlists)
19. [Search on SoundCloud](https://help.soundcloud.com/hc/en-us/articles/115003568168-Search-on-SoundCloud)
20. [Upload using the SoundCloud App](https://help.soundcloud.com/hc/en-us/articles/360043080874-Upload-using-the-Soundcloud-App)
21. [Rearrange tracks](https://help.soundcloud.com/hc/en-us/articles/1260801673729-Rearrange-tracks)
22. [Offline Listening with SoundCloud Go](https://help.soundcloud.com/hc/en-us/articles/31354612612763-Offline-Listening-with-SoundCloud-Go)
23. [Liked By](https://help.soundcloud.com/hc/en-us/articles/38293355919259-Liked-By)
