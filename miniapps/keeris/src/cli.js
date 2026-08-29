import { Command } from 'commander';
import { mkdirSync, writeFileSync } from 'node:fs';
import { openDatabase } from './db.js';
import { executeGraphql } from './server/graphql.js';
import { config } from './config.js';

const program = new Command();

program
  .name('curator')
  .description('Curator Engine & Archive Management CLI (driven by inner GraphQL API)')
  .option('-d, --db <path>', 'Database path', config.defaultDatabase);

program
  .command('stats')
  .description('Display archive & program database statistics via GraphQL')
  .option('-j, --json', 'Output raw JSON payload')
  .action(async (options) => {
    const db = openDatabase(program.opts().db);
    const res = await executeGraphql(db, `query {
      stats {
        episodes
        tracks
        uniqueTracks
        programs
        noTracks
        oldest
        newest
        programBreakdown {
          programId
          programTitle
          episodes
          tracks
          uniqueTracks
        }
      }
    }`);
    if (res.errors?.length) throw new Error(res.errors[0].message);
    const stats = res.data.stats;
    if (options.json) {
      console.log(JSON.stringify(stats, null, 2));
    } else {
      console.log('\n=== Curator Archive Statistics ===');
      console.log(`Total Episodes: ${stats.episodes.toLocaleString()}`);
      console.log(`Total Airings:  ${stats.tracks.toLocaleString()}`);
      console.log(`Unique Tracks:  ${stats.uniqueTracks.toLocaleString()}`);
      console.log(`Programs:       ${stats.programs.toLocaleString()}`);
      console.log('\n=== Program Breakdown (Unique Tracks per Program) ===');
      console.log('─────────────────────────────────────────────────────────────────────────────');
      console.log('Program'.padEnd(35) + 'Episodes'.padStart(12) + 'Airings'.padStart(12) + 'Unique Tracks'.padStart(16));
      console.log('─────────────────────────────────────────────────────────────────────────────');
      for (const item of stats.programBreakdown) {
        console.log(
          item.programTitle.padEnd(35) +
          item.episodes.toLocaleString().padStart(12) +
          item.tracks.toLocaleString().padStart(12) +
          item.uniqueTracks.toLocaleString().padStart(16)
        );
      }
      console.log('─────────────────────────────────────────────────────────────────────────────\n');
    }
    db.close();
  });

program
  .command('search')
  .description('Search unique song recordings or tracks via GraphQL')
  .option('-a, --artist <name>', 'Artist or song keyword to search')
  .option('-l, --limit <number>', 'Maximum results limit', '50')
  .action(async (options) => {
    const db = openDatabase(program.opts().db);
    const queryTerm = options.artist ?? process.argv[3] ?? '';
    const res = await executeGraphql(db, `query($search: String, $limit: Int) {
      uniqueTracks(search: $search, limit: $limit) {
        id
        artist
        title
        playCount
        airings {
          date
          programTitle
          episodeTitle
          episodeUrl
        }
      }
    }`, { search: queryTerm, limit: Number(options.limit) });
    if (res.errors?.length) throw new Error(res.errors[0].message);
    console.log(JSON.stringify(res.data.uniqueTracks, null, 2));
    db.close();
  });

program
  .command('agents')
  .description('List registered Curator workflow agents & schedules via GraphQL')
  .action(async () => {
    const db = openDatabase(program.opts().db);
    const res = await executeGraphql(db, 'query { curatorAgents { id name ast schedule isActive enabled } }');
    if (res.errors?.length) throw new Error(res.errors[0].message);
    console.log(JSON.stringify(res.data.curatorAgents, null, 2));
    db.close();
  });

program
  .command('requests')
  .description('Query recent Curator workflow execution requests via GraphQL')
  .option('-l, --limit <number>', 'Number of execution log records to retrieve', '20')
  .action(async (options) => {
    const db = openDatabase(program.opts().db);
    const res = await executeGraphql(db, 'query($limit: Int) { curatorRequests(limit: $limit) { id agentName createdAt responses { id content createdAt } } }', { limit: Number(options.limit) });
    if (res.errors?.length) throw new Error(res.errors[0].message);
    console.log(JSON.stringify(res.data.curatorRequests, null, 2));
    db.close();
  });

program
  .command('trigger')
  .description('Trigger a Curator agent workflow execution via GraphQL mutation')
  .requiredOption('-a, --agent <name>', 'Agent workflow name (e.g. vikerraadio_kauamangiv_scrape)')
  .option('-r, --refresh', 'Refresh existing episode pages')
  .action(async (options) => {
    const db = openDatabase(program.opts().db);
    console.log(`[Curator CLI] Invoking triggerCuratorAgent mutation for '${options.agent}'...`);
    const res = await executeGraphql(db, 'mutation($name: String!, $refresh: Boolean) { triggerCuratorAgent(name: $name, refresh: $refresh) { id requestId content createdAt } }', { name: options.agent, refresh: !!options.refresh });
    if (res.errors?.length) throw new Error(res.errors[0].message);
    console.log(JSON.stringify(res.data.triggerCuratorAgent, null, 2));
    db.close();
  });

program
  .command('scrape')
  .description('Scrape a Vikerraadio program by series content ID via GraphQL mutation')
  .option('-s, --series <id>', 'ERR series content ID', '1037846')
  .option('-p, --program <title>', 'Program title', 'Vikerraadio')
  .option('-r, --refresh', 'Refresh existing episode pages')
  .action(async (options) => {
    const db = openDatabase(program.opts().db);
    console.log(`[Curator CLI] Invoking scrapeProgram mutation for series '${options.series}'...`);
    const res = await executeGraphql(db, 'mutation($series: String!, $program: String!, $refresh: Boolean) { scrapeProgram(seriesContentId: $series, programTitle: $program, refresh: $refresh) { seriesContentId programTitle episodesSeen episodesParsed tracksSaved failures } }', { series: options.series, program: options.program, refresh: !!options.refresh });
    if (res.errors?.length) throw new Error(res.errors[0].message);
    console.log(JSON.stringify(res.data.scrapeProgram, null, 2));
    db.close();
  });

program
  .command('update-metadata')
  .description('Update episode text metadata & notes via GraphQL mutation')
  .requiredOption('-u, --url <url>', 'Episode web page URL')
  .option('-e, --description <text>', 'Episode description text')
  .option('-f, --full-text <text>', 'Episode full show text')
  .action(async (options) => {
    const db = openDatabase(program.opts().db);
    const res = await executeGraphql(db, `mutation($url: String!, $description: String, $fullText: String) {
      updateEpisodeMetadata(url: $url, description: $description, fullText: $fullText) {
        id
        description
        fullText
        summary
      }
    }`, { url: options.url, description: options.description, fullText: options.fullText });
    if (res.errors?.length) throw new Error(res.errors[0].message);
    console.log(JSON.stringify(res.data.updateEpisodeMetadata, null, 2));
    db.close();
  });

program
  .command('export')
  .description('Export tracks to CSV format')
  .option('-o, --output <path>', 'CSV output path', 'data/tracks.csv')
  .action(async (options) => {
    const db = openDatabase(program.opts().db);
    const rows = db.prepare(`SELECT e.scheduled_at AS date, e.url, t.position, t.artist, t.title, t.raw_text
      FROM tracks t JOIN episodes e ON e.id=t.episode_id ORDER BY e.scheduled_at, t.position`).all();
    const csvValue = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [['date', 'url', 'position', 'artist', 'title', 'raw_text'], ...rows.map((row) => [row.date, row.url, row.position, row.artist, row.title, row.raw_text])]
      .map((row) => row.map(csvValue).join(',')).join('\n') + '\n';
    mkdirSync('data', { recursive: true });
    writeFileSync(options.output, csv, 'utf8');
    console.log(JSON.stringify({ output: options.output, rows: rows.length }, null, 2));
    db.close();
  });

await program.parseAsync(process.argv);