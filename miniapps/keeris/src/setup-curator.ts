import { createKeerisHost } from './host.ts';

const host = await createKeerisHost();
try {
  const result = await host.seed();
  console.log(JSON.stringify({ phase: 'setup-complete', ...result }, null, 2));
} finally {
  await host.stop();
}

