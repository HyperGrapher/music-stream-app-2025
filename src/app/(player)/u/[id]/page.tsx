import ArtistPage from "../../[artist]/page";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return ArtistPage({ params: Promise.resolve({ artist: id }) });
}
