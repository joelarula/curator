import { RADIO_PROGRAMS, buildPipelineScrapeAST, type CreateProgramScrapeASTOptions } from './manifest.ts';

export interface KeerisAgentDefinition {
  ast: ReturnType<typeof buildPipelineScrapeAST>;
  schedule: string;
  enabled: boolean;
}

export interface KeerisDomainPlugin {
  name: string;
  scripts: Record<string, (args: any) => Promise<any>>;
  agents: Record<string, KeerisAgentDefinition>;
}

export const keerisDomainPlugin: KeerisDomainPlugin = {
  name: 'keeris-domain',
  scripts: {
    'keeris.search': async ({ query }: { query?: string }) => ({ query }),
  },
  agents: Object.fromEntries(
    Object.entries(RADIO_PROGRAMS).map(([id, def]) => [
      id,
      {
        ast: buildPipelineScrapeAST(def),
        schedule: def.schedule,
        enabled: def.enabled,
      },
    ])
  ),
};
