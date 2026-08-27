export const keerisDomainPlugin = {
  name: 'keeris-domain',
  models: [
    {
      uri: 'keeris:EpisodeShape',
      targetClass: 'schema:RadioEpisode',
      name: 'ERR radio episode',
      properties: {
        url: { path: 'schema:url', datatype: 'xsd:anyURI', minCount: 1, maxCount: 1 },
        title: { path: 'schema:name', datatype: 'xsd:string', minCount: 1, maxCount: 1 },
        scheduledAt: { path: 'schema:scheduledTime', datatype: 'xsd:dateTime', maxCount: 1 },
        publishedAt: { path: 'schema:datePublished', datatype: 'xsd:dateTime', maxCount: 1 },
        parseStatus: { path: 'keeris:parseStatus', datatype: 'xsd:string', minCount: 1, maxCount: 1 },
        tracks: { path: 'schema:isPartOf', class: 'schema:MusicRecording', inverse: true },
      },
    },
    {
      uri: 'keeris:TrackShape',
      targetClass: 'schema:MusicRecording',
      name: 'ERR played track',
      properties: {
        position: { path: 'schema:position', datatype: 'xsd:integer', minCount: 1, maxCount: 1 },
        artist: { path: 'schema:byArtist', datatype: 'xsd:string', maxCount: 1 },
        title: { path: 'schema:name', datatype: 'xsd:string', maxCount: 1 },
        rawText: { path: 'keeris:rawText', datatype: 'xsd:string', minCount: 1, maxCount: 1 },
        episode: { path: 'schema:isPartOf', class: 'schema:RadioEpisode', maxCount: 1 },
      },
    },
  ],
  scripts: {
    'keeris.search': async ({ query }) => ({ query }),
  },
  agents: {
    keeris_kauamangiv_scrape: {
      type: 'Curator_Tool',
      toolName: 'keeris_scrape',
      args: { refresh: false },
    },
    keeris_legacy_migration: {
      type: 'Curator_Tool',
      toolName: 'keeris_migrate_legacy',
      args: {},
    },
    keeris_migration_verification: {
      type: 'Curator_Tool',
      toolName: 'keeris_verify_migration',
      args: {},
    },
  },
};