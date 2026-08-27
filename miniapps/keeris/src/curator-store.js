const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

export async function createCuratorStore(prisma, engine) {
  if (!prisma) return null;
  const { SemanticSchemaEngine } = await import('@curator/agent-server');
  const semantic = new SemanticSchemaEngine(prisma);
  semantic.loadRegisteredShapes(engine);
  const userId = Number(process.env.CURATOR_USER_ID ?? 1);
  const projectId = Number(process.env.CURATOR_PROJECT_ID ?? 1);

  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, username: 'keeris-system', name: 'Keeris System', email: 'keeris-system@local' },
  });
  await prisma.project.upsert({
    where: { id: projectId },
    update: {},
    create: { id: projectId, name: 'Keeris', userId },
  });

  return {
    async verify(options = {}) {
      const { verifyCuratorMigration } = await import('./verify-curator.js');
      return verifyCuratorMigration(prisma, { userId, projectId, ...options });
    },
    async saveEpisode(episode, tracks) {
      const episodeUri = `err:episode:${episode.id}`;
      await semantic.createEntity('keeris:EpisodeShape', episodeUri, {
        url: episode.url,
        title: episode.heading ?? 'Kauamängiv',
        scheduledAt: episode.scheduledAt,
        publishedAt: episode.publishedAt,
        parseStatus: tracks.length ? 'parsed' : 'no_tracks',
      }, userId, projectId);
      for (const track of tracks) {
        await semantic.createEntity('keeris:TrackShape', `err:track:${episode.id}:${track.position}`, {
          position: track.position,
          artist: track.artist,
          title: track.title,
          rawText: track.rawText,
          episode: episodeUri,
        }, userId, projectId);
      }
      return episodeUri;
    },
    async saveEpisodes(episodes) {
      await prisma.$transaction(async (tx) => {
        const predicateUris = ['rdf:type', 'schema:url', 'schema:name', 'schema:scheduledTime', 'schema:datePublished', 'keeris:parseStatus', 'schema:position', 'schema:byArtist', 'keeris:rawText', 'schema:isPartOf'];
        const predicateRows = await Promise.all(predicateUris.map((uri) => tx.resource.upsert({ where: { uri }, update: { existent: true }, create: { uri, title: uri, userId, projectId } })));
        const predicates = new Map(predicateRows.map((row) => [row.uri, row.id]));
        const classes = await Promise.all([
          tx.resource.upsert({ where: { uri: 'schema:RadioEpisode' }, update: {}, create: { uri: 'schema:RadioEpisode', title: 'ERR radio episode', userId, projectId } }),
          tx.resource.upsert({ where: { uri: 'schema:MusicRecording' }, update: {}, create: { uri: 'schema:MusicRecording', title: 'ERR played track', userId, projectId } }),
        ]);
        const subjects = [];
        const literals = new Map();
        const addLiteral = (value) => {
          const text = String(value);
          const uri = `literal:xsd:string:${Buffer.from(text).toString('base64url')}`;
          literals.set(uri, { uri, title: text.slice(0, 255), content: text, userId, projectId });
          return uri;
        };
        for (const episode of episodes) {
          subjects.push({ uri: `err:episode:${episode.id}`, title: episode.heading ?? 'Kauamängiv', userId, projectId });
          for (const track of episode.tracks) subjects.push({ uri: `err:track:${episode.id}:${track.position}`, title: track.title ?? track.rawText, userId, projectId });
          addLiteral(episode.url); addLiteral(episode.heading ?? 'Kauamängiv');
          for (const track of episode.tracks) { if (track.artist != null) addLiteral(track.artist); if (track.title != null) addLiteral(track.title); addLiteral(track.rawText); }
        }
        const resourceRows = [...subjects, ...literals.values()];
        
        const resourceUris = resourceRows.map((row) => row.uri);
        const existingUris = new Set();
        for (const chunk of chunkArray(resourceUris, 200)) {
          const rows = await tx.resource.findMany({ where: { uri: { in: chunk } }, select: { uri: true } });
          for (const row of rows) existingUris.add(row.uri);
        }

        const resourcesToCreate = resourceRows.filter((row, index, rows) => !existingUris.has(row.uri) && rows.findIndex((candidate) => candidate.uri === row.uri) === index);
        for (const chunk of chunkArray(resourcesToCreate, 100)) {
          await tx.resource.createMany({ data: chunk });
        }

        const allUris = [...subjects, ...literals.values()].map((row) => row.uri);
        const resources = new Map();
        for (const chunk of chunkArray(allUris, 200)) {
          const rows = await tx.resource.findMany({ where: { uri: { in: chunk } } });
          for (const row of rows) resources.set(row.uri, row.id);
        }

        const relations = [];
        const addString = (subjectUri, predicateUri, value) => { if (value != null) relations.push({ subjectId: resources.get(subjectUri), predicateId: predicates.get(predicateUri), objectId: resources.get(addLiteral(value)), projectId }); };
        for (const episode of episodes) {
          const episodeUri = `err:episode:${episode.id}`;
          relations.push({ subjectId: resources.get(episodeUri), predicateId: predicates.get('rdf:type'), objectId: classes[0].id, projectId });
          addString(episodeUri, 'schema:url', episode.url); addString(episodeUri, 'schema:name', episode.heading ?? 'Kauamängiv');
          for (const track of episode.tracks) {
            const trackUri = `err:track:${episode.id}:${track.position}`;
            relations.push({ subjectId: resources.get(trackUri), predicateId: predicates.get('rdf:type'), objectId: classes[1].id, projectId });
            addString(trackUri, 'schema:byArtist', track.artist); addString(trackUri, 'schema:name', track.title); addString(trackUri, 'keeris:rawText', track.rawText);
            relations.push({ subjectId: resources.get(trackUri), predicateId: predicates.get('schema:isPartOf'), objectId: resources.get(episodeUri), projectId });
          }
        }
        const validRelations = relations.filter((relation) => relation.subjectId && relation.predicateId && relation.objectId);
        const relationKey = (relation) => `${relation.subjectId}:${relation.predicateId}:${relation.objectId}`;
        
        const existingRelations = new Set();
        // Since sqlite limit is around 999 or 2000, we should chunk search safely.
        // Doing combined queries in batch could exceed, so let's check in small chunks (e.g. 100 relations check at a time)
        for (const chunk of chunkArray(validRelations, 100)) {
          const subjectIds = [...new Set(chunk.map((r) => r.subjectId))];
          const predicateIds = [...new Set(chunk.map((r) => r.predicateId))];
          const objectIds = [...new Set(chunk.map((r) => r.objectId))];
          const rows = await tx.relation.findMany({
            where: {
              subjectId: { in: subjectIds },
              predicateId: { in: predicateIds },
              objectId: { in: objectIds }
            },
            select: { subjectId: true, predicateId: true, objectId: true }
          });
          for (const row of rows) {
            existingRelations.add(relationKey(row));
          }
        }

        const relationsToCreate = validRelations.filter((relation, index, rows) => !existingRelations.has(relationKey(relation)) && rows.findIndex((candidate) => relationKey(candidate) === relationKey(relation)) === index);
        for (const chunk of chunkArray(relationsToCreate, 100)) {
          await tx.relation.createMany({ data: chunk });
        }
      });
    },
  };
}
