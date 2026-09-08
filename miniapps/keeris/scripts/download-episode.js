import { openDatabase } from '../src/db.js';
import { createErrRadioPlugin } from '../src/plugins/err-radio.js';

async function main() {
  const targetUrl = process.argv[2] || 'https://klassikaraadio.err.ee/1609545143/folgialbum-euroraadio-joulufolk-1';
  const customFileName = process.argv[3] || null;

  console.log(`=== Keeris Audio Episode Downloader ===`);
  console.log(`Target Episode URL: ${targetUrl}`);
  if (customFileName) console.log(`Custom Output Filename: ${customFileName}`);

  const db = openDatabase('postgresql://curator:curator_secret@192.168.1.110:5432/keeris');
  const plugin = createErrRadioPlugin(db);

  try {
    console.log('\nExtracting stream and downloading audio file...');
    const result = await plugin.tools.vikerraadio_download_episode.runAsync({
      args: {
        url: targetUrl,
        outputDir: 'data/downloads',
        fileName: customFileName,
      },
    });

    console.log('\n=== Download Complete ===');
    console.log(`Episode URL:  ${result.episodeUrl}`);
    console.log(`Stream URL:   ${result.audioUrl}`);
    console.log(`Saved File:   ${result.filePath}`);
    console.log(`File Size:    ${result.fileSizeMB}`);
  } catch (error) {
    console.error('\nDownload failed:', error.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();
