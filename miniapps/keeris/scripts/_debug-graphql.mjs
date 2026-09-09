import { DatabaseSync } from 'node:sqlite';
import { executeInWorkerGraphql } from '../wasm/graphql-schema.js';

const sqlite = new DatabaseSync('data/keeris.db', { readOnly: true });

// Adapter that mimics the sqlite-wasm oo1.DB#exec({sql, bind, rowMode, resultRows}) contract
const db = {
  exec({ sql, bind = [], rowMode, resultRows }) {
    const stmt = sqlite.prepare(sql);
    if (/^\s*select/i.test(sql)) {
      const rows = stmt.all(...bind);
      if (resultRows) {
        for (const row of rows) resultRows.push({ ...row });
      }
    } else {
      stmt.run(...bind);
    }
  },
};

const query = `
  query GetUniqueTracks($search: String, $programIds: [ID]) {
    uniqueTracks(search: $search, programIds: $programIds, limit: 100) {
      id
      artist
      title
      playCount
      firstPlayedAt
      lastPlayedAt
      airings {
        id
        position
        date
        episodeTitle
        episodeUrl
        programTitle
        episodeDescription
      }
    }
  }
`;

const result = await executeInWorkerGraphql(db, query, { search: null, programIds: null });
console.log('errors:', JSON.stringify(result.errors, null, 2));
console.log('data.uniqueTracks length:', result.data?.uniqueTracks?.length);
console.log('first item:', JSON.stringify(result.data?.uniqueTracks?.[0], null, 2));
