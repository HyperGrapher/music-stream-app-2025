import { PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();

async function main() {
    console.log("Starting seed script...");

    // Clear existing data (optional - be careful in production!)
    console.log("Clearing existing data...");
    await prisma.playHistory.deleteMany();
    await prisma.like.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.repost.deleteMany();
    await prisma.follow.deleteMany();
    await prisma.playlistTrack.deleteMany();
    await prisma.playlist.deleteMany();
    await prisma.track.deleteMany();
    await prisma.album.deleteMany();
    await prisma.session.deleteMany();
    await prisma.account.deleteMany();
    await prisma.user.deleteMany();

    // Create artists (users)
    console.log("Creating artists...");
    const artists = [];
    const artistNames = [
        "Muse",
        "Radiohead",
        "Arcade Fire",
        "The Killers",
        "Florence + The Machine",
        "Tame Impala",
        "Gorillaz",
        "Arctic Monkeys",
        "Daft Punk",
        "LCD Soundsystem"
    ];

    for (let i = 0; i < 10; i++) {
        const id = uuidv4();
        const name = artistNames[i];
        const createdAt = faker.date.past({ years: 5 });

        const artist = await prisma.user.create({
            data: {
                id,
                name: name ?? faker.person.fullName(),
                email: faker.internet.email({ firstName: name?.replace(/\s+/g, '').toLowerCase() }),
                bio: faker.lorem.paragraph(),
                location: faker.location.city() + ", " + faker.location.country(),
                website: faker.internet.url(),
                emailVerified: true,
                image: faker.image.urlLoremFlickr({ category: 'music', width: 800, height: 600 }),
                profileImage: faker.image.urlLoremFlickr({ category: 'people', width: 400, height: 400 }),
                createdAt,
                updatedAt: faker.date.between({ from: createdAt, to: new Date() }),
                accounts: {
                    create: {
                        id: uuidv4(),
                        providerId: "credentials",
                        accountId: uuidv4(),
                        accessToken: faker.string.uuid(),
                        createdAt: createdAt,
                        updatedAt: new Date(),
                    }
                }
            }
        });

        artists.push(artist);
        console.log(`Created artist: ${artist.name}`);
    }

    // Create albums for each artist
    console.log("Creating albums...");
    const albums = [];

    for (const artist of artists) {
        const numAlbums = faker.number.int({ min: 1, max: 3 });

        for (let i = 0; i < numAlbums; i++) {
            const albumCreatedAt = faker.date.past({ years: 3 });
            const albumType = ["ALBUM", "EP", "SINGLE", "SET"][faker.number.int({ min: 0, max: 3 })];

            const album = await prisma.album.create({
                data: {
                    id: uuidv4(),
                    title: faker.music.songName(),
                    description: faker.lorem.paragraph(),
                    artworkUrl: faker.image.urlLoremFlickr({ category: 'album', width: 500, height: 500 }),
                    releaseDate: albumCreatedAt,
                    type: albumType as any,
                    isPrivate: false,
                    createdAt: albumCreatedAt,
                    updatedAt: faker.date.between({ from: albumCreatedAt, to: new Date() }),
                    userId: artist.id,
                }
            });

            albums.push(album);
            console.log(`Created album: ${album.title} for ${artist.name}`);
        }
    }

    // Create tracks for each artist
    console.log("Creating tracks...");
    const tracks = [];
    const genreList = ["Rock", "Electronic", "Pop", "Alternative", "Indie", "Hip Hop", "R&B", "Jazz", "Classical", "Metal"];

    for (const artist of artists) {
        const numTracks = faker.number.int({ min: 5, max: 15 });

        // Get albums for this artist
        const artistAlbums = albums.filter(album => album.userId === artist.id);

        for (let i = 0; i < numTracks; i++) {
            const trackCreatedAt = faker.date.past({ years: 2 });
            const title = faker.music.songName();
            const genre = genreList[faker.number.int({ min: 0, max: genreList.length - 1 })];
            const albumId = i < artistAlbums.length ? artistAlbums[i]?.id : null;

            // Create URL-friendly title for song routes
            const titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

            const track = await prisma.track.create({
                data: {
                    id: uuidv4(),
                    title,
                    description: faker.lorem.paragraph(),
                    storageKey: `https://example.com/audio/${titleSlug}.mp3`,
                    duration: faker.number.int({ min: 120, max: 420 }), // 2-7 minutes in seconds
                    waveformData: JSON.stringify(Array.from({ length: 100 }, () => faker.number.int({ min: 0, max: 100 }))),
                    isOriginal: true,
                    isPrivate: false,
                    genre,
                    subGenre: faker.helpers.maybe(() => genreList[faker.number.int({ min: 0, max: genreList.length - 1 })], { probability: 0.3 }),
                    bpm: faker.number.int({ min: 60, max: 180 }),
                    key: ["C", "D", "E", "F", "G", "A", "B"][faker.number.int({ min: 0, max: 6 })] ?? "" +
                        (["", "m"][faker.number.int({ min: 0, max: 1 })] ?? ""),
                    tags: Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () =>
                        faker.word.sample() ?? "").join(','),
                    releaseDate: trackCreatedAt,
                    recordLabel: faker.helpers.maybe(() => faker.company.name(), { probability: 0.5 }),
                    artworkUrl: faker.image.urlLoremFlickr({ category: 'music', width: 500, height: 500 }),
                    playCount: faker.number.int({ min: 0, max: 10000 }),
                    downloadCount: faker.number.int({ min: 0, max: 1000 }),
                    likeCount: faker.number.int({ min: 0, max: 500 }),
                    repostCount: faker.number.int({ min: 0, max: 100 }),
                    commentCount: faker.number.int({ min: 0, max: 50 }),
                    createdAt: trackCreatedAt,
                    updatedAt: faker.date.between({ from: trackCreatedAt, to: new Date() }),
                    userId: artist.id,
                    albumId,
                }
            });

            tracks.push(track);

            if (i % 5 === 0) {
                console.log(`Created ${i + 1} tracks for ${artist.name}...`);
            }
        }

        console.log(`Completed tracks for ${artist.name}`);
    }

    // Create follows between users
    console.log("Creating follows...");
    for (const follower of artists) {
        // Each artist follows 3-7 other artists
        const numFollowing = faker.number.int({ min: 3, max: 7 });
        const artistsToFollow = faker.helpers.arrayElements(
            artists.filter(a => a.id !== follower.id),
            numFollowing
        );

        for (const following of artistsToFollow) {
            await prisma.follow.create({
                data: {
                    id: uuidv4(),
                    followerId: follower.id,
                    followingId: following.id,
                    createdAt: faker.date.recent({ days: 365 }),
                }
            });
        }
    }

    // Create likes
    console.log("Creating likes...");
    for (const artist of artists) {
        // Each artist likes 5-15 tracks
        const numLikes = faker.number.int({ min: 5, max: 15 });
        const tracksToLike = faker.helpers.arrayElements(
            tracks.filter(t => t.userId !== artist.id),
            numLikes
        );

        for (const track of tracksToLike) {
            await prisma.like.create({
                data: {
                    id: uuidv4(),
                    userId: artist.id,
                    trackId: track.id,
                    createdAt: faker.date.recent({ days: 180 }),
                }
            });
        }
    }

    // Create comments
    console.log("Creating comments...");
    for (const artist of artists) {
        // Each artist comments on 3-8 tracks
        const numComments = faker.number.int({ min: 3, max: 8 });
        const tracksToComment = faker.helpers.arrayElements(
            tracks,
            numComments
        );

        for (const track of tracksToComment) {
            await prisma.comment.create({
                data: {
                    id: uuidv4(),
                    content: faker.lorem.sentence(),
                    timestampSeconds: faker.number.int({ min: 0, max: track.duration }),
                    userId: artist.id,
                    trackId: track.id,
                    createdAt: faker.date.recent({ days: 90 }),
                    updatedAt: new Date(),
                }
            });
        }
    }

    // Create playlists
    console.log("Creating playlists...");
    for (const artist of artists) {
        // Each artist creates 1-3 playlists
        const numPlaylists = faker.number.int({ min: 1, max: 3 });

        for (let i = 0; i < numPlaylists; i++) {
            const playlistCreatedAt = faker.date.recent({ days: 120 });

            const playlist = await prisma.playlist.create({
                data: {
                    id: uuidv4(),
                    title: faker.lorem.words({ min: 2, max: 5 }),
                    description: faker.lorem.paragraph(),
                    artworkUrl: faker.image.urlLoremFlickr({ category: 'abstract', width: 500, height: 500 }),
                    isPrivate: faker.datatype.boolean({ probability: 0.2 }),
                    isCollaborative: faker.datatype.boolean({ probability: 0.1 }),
                    createdAt: playlistCreatedAt,
                    updatedAt: faker.date.between({ from: playlistCreatedAt, to: new Date() }),
                    userId: artist.id,
                }
            });

            // Add 5-20 tracks to each playlist
            const numPlaylistTracks = faker.number.int({ min: 5, max: 20 });
            const tracksForPlaylist = faker.helpers.arrayElements(tracks, numPlaylistTracks);

            for (let j = 0; j < tracksForPlaylist.length; j++) {
                await prisma.playlistTrack.create({
                    data: {
                        id: uuidv4(),
                        position: j,
                        playlistId: playlist.id,
                        trackId: tracksForPlaylist[j]?.id ?? '',
                        createdAt: faker.date.between({ from: playlistCreatedAt, to: new Date() }),
                    }
                });
            }

            console.log(`Created playlist: ${playlist.title} with ${numPlaylistTracks} tracks for ${artist.name}`);
        }
    }

    console.log("Database seeding completed successfully!");
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error("Error during seeding:", e);
        await prisma.$disconnect();
        process.exit(1);
    }); 