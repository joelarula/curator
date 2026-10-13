import { ChunkingService, type TextChunk, type ChunkingOptions } from './ChunkingService.js';

export * from './ChunkingService.js';

export function ragPlugin(options: ChunkingOptions = {}) {
  return {
    name: 'rag',
    version: '1.0.0',
    description: 'Curator Retrieval-Augmented Generation (RAG) and text chunking plugin',
    service: ChunkingService,
    splitAndEmbed: (content: string, opts?: any) => ChunkingService.splitAndEmbed(content, { ...options, ...opts }),
    createChunksFromText: ChunkingService.createChunksFromText.bind(ChunkingService),
  };
}

export default ragPlugin;
