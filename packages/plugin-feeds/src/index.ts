import { process_feed } from './process_feed.js';

export * from './process_feed.js';

export function feedsPlugin() {
  return {
    name: 'feeds',
    version: '1.0.0',
    description: 'Curator RSS and Atom feeds processing plugin',
    tools: {
      process_feed,
    },
  };
}
