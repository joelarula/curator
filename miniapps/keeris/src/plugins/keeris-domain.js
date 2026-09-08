import { createProgramScrapeAST } from './err-radio.js';

export const keerisDomainPlugin = {
  name: 'keeris-domain',
  scripts: {
    'keeris.search': async ({ query }) => ({ query }),
  },
  agents: {
    vikerraadio_kauamangiv_scrape: {
      ast: createProgramScrapeAST({ seriesContentId: '1037846', programTitle: 'Kauamängiv' }),
      schedule: '0 14 * * 1-5', // Mon-Fri at 14:00 (after 12:15-14:00 broadcast)
      enabled: true,
    },
    vikerraadio_originaal_ja_koopia_scrape: {
      ast: createProgramScrapeAST({ seriesContentId: '1037950', programTitle: 'Originaal ja koopia' }),
      schedule: '0 15 * * 6', // Saturdays at 15:00
      enabled: true,
    },
    vikerraadio_kantri_alati_jaab_scrape: {
      ast: createProgramScrapeAST({ seriesContentId: '1037843', programTitle: 'Kantri alati jääb' }),
      schedule: '0 21 * * 6', // Saturdays at 21:00
      enabled: true,
    },
    vikerraadio_kuldrandevuu_scrape: {
      ast: createProgramScrapeAST({ seriesContentId: '1037864', programTitle: 'Kuldrandevüü' }),
      schedule: '0 18 * * 0', // Sundays at 18:00
      enabled: true,
    },
    klassikaraadio_fantaasia_scrape: {
      ast: createProgramScrapeAST({ seriesContentId: '1038126', programTitle: 'Fantaasia' }),
      schedule: '0 2 * * *', // Nightly at 02:00
      enabled: true,
    },
    klassikaraadio_kella_6_dzass_scrape: {
      ast: createProgramScrapeAST({ seriesContentId: '1038156', programTitle: 'Kella-6-džäss' }),
      schedule: '0 19 * * 1-5', // Mon-Fri at 19:00 (after 18:00 broadcast)
      enabled: true,
    },
    klassikaraadio_lihtsalt_nostalgia_scrape: {
      ast: createProgramScrapeAST({ seriesContentId: 'https://klassikaraadio.err.ee/1610109911/lihtsalt-nostalgia-kaisa-johvik', programTitle: 'Lihtsalt nostalgia' }),
      schedule: '0 16 * * 0', // Sundays at 16:00
      enabled: true,
    },
    vikerraadio_oomuusika_scrape: {
      ast: createProgramScrapeAST({ seriesContentId: 'https://vikerraadio.err.ee/1610113264/oomuusika', programTitle: 'Öömuusika' }),
      schedule: '0 6 * * *', // Daily at 06:00 (after night broadcast)
      enabled: true,
    },
    klassikaraadio_helitrakk_scrape: {
      ast: createProgramScrapeAST({ seriesContentId: 'https://klassikaraadio.err.ee/1610105843/helitrakk', programTitle: 'Heliträkk' }),
      schedule: '0 11 * * 6', // Saturdays at 11:00
      enabled: true,
    },
    klassikaraadio_folgialbum_scrape: {
      ast: createProgramScrapeAST({ seriesContentId: '1038132', programTitle: 'Folgialbum' }),
      schedule: '0 11 * * 0', // Sundays at 11:00 (after 10:05 broadcast)
      enabled: true,
    },
    klassikaraadio_vanamuusikatund_scrape: {
      ast: createProgramScrapeAST({ seriesContentId: '1038247', programTitle: 'Vanamuusikatund' }),
      schedule: '0 15 * * 6', // Saturdays at 15:00
      enabled: true,
    },
    klassikaraadio_tantsutund_scrape: {
      ast: createProgramScrapeAST({ seriesContentId: '1038102', programTitle: 'Tantsutund' }),
      schedule: '0 14 * * 0', // Sundays at 14:00
      enabled: true,
    },
    // Archived / Completed Series (on-demand triggerable via GraphQL)
    vikerraadio_heldur_karmo_aeg_scrape: {
      ast: createProgramScrapeAST({ seriesContentId: '1610049724', programTitle: 'Heldur Karmo aeg' }),
      schedule: '0 0 1 1 *',
      enabled: false,
    },
    vikerraadio_muusika_noudlikule_maitsele_scrape: {
      ast: createProgramScrapeAST({ seriesContentId: '1608635380', programTitle: 'Muusika nõudlikule maitsele' }),
      schedule: '0 0 1 1 *',
      enabled: false,
    },
    vikerraadio_jaak_joala_parimad_laulud_scrape: {
      ast: createProgramScrapeAST({ seriesContentId: 'https://vikerraadio.err.ee/1609719716/jaak-joala-parimad-laulud', programTitle: 'Jaak Joala parimad laulud' }),
      schedule: '0 0 1 1 *',
      enabled: false,
    },
    vikerraadio_stuudios_on_jaan_elgula_scrape: {
      ast: createProgramScrapeAST({ seriesContentId: 'https://vikerraadio.err.ee/817942/stuudios-on-jaan-elgula-2-tund/818433', programTitle: 'Stuudios on Jaan Elgula' }),
      schedule: '0 20 * * 5', // Fridays at 20:00 (after 18:00-20:00 broadcast)
      enabled: true,
    },
    vikerraadio_soovide_aeg_scrape: {
      ast: createProgramScrapeAST({ seriesContentId: '1038019', programTitle: 'Soovide aeg' }),
      schedule: '0 17 * * 6', // Saturdays at 17:00 (after 15:05-17:00 broadcast)
      enabled: true,
    },
  },
};