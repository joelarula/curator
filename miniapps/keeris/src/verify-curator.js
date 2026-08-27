export async function verifyCuratorMigration(prisma, { userId = 1, projectId = 1, sampleEpisodeId } = {}) {
  const episodeType = await prisma.resource.findUnique({ where: { uri: 'schema:RadioEpisode' } });
  const trackType = await prisma.resource.findUnique({ where: { uri: 'schema:MusicRecording' } });
  if (!episodeType || !trackType) throw new Error('Curator semantic class resources are missing');
  const [episodes, tracks] = await Promise.all([
    prisma.relation.count({ where: { objectId: episodeType.id, projectId, existent: true } }),
    prisma.relation.count({ where: { objectId: trackType.id, projectId, existent: true } }),
  ]);
  if (!episodes || !tracks) throw new Error(`Curator migration incomplete: ${episodes} episodes, ${tracks} tracks`);
  const prefix = sampleEpisodeId ? `err:episode:${sampleEpisodeId}` : 'err:episode:';
  const sample = await prisma.resource.findFirst({ where: { uri: { startsWith: prefix }, userId, projectId } });
  if (!sample) throw new Error('No Curator episode entity found for verification');
  return { valid: true, episodes, tracks, sampleUri: sample.uri, userId, projectId };
}