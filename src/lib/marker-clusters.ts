/** Markers closer than this share of the waveform merge into one with a count (readable on phones). */
export const CLUSTER_WIDTH_PERCENT = 3;

/** Groups timed comments whose positions are closer than `widthPercent` of the track; each group sits at its first comment. */
export function clusterMarkers<T extends { seconds: number }>(markers: T[], duration: number, widthPercent = CLUSTER_WIDTH_PERCENT): T[][] {
  const sorted = [...markers].sort((a, b) => a.seconds - b.seconds);
  const groups: T[][] = [];
  for (const marker of sorted) {
    const group = groups.at(-1);
    const start = group?.[0];
    if (group && start && duration > 0 && ((marker.seconds - start.seconds) / duration) * 100 < widthPercent) group.push(marker);
    else groups.push([marker]);
  }
  return groups;
}
