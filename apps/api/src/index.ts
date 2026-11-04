import { buildApp } from './app.js';

const app = await buildApp({ logger: true });
try {
  await app.listen({ host: process.env.HOST ?? '0.0.0.0', port: Number(process.env.PORT ?? 3001) });
} catch {
  app.log.error('Could not start API server.');
  process.exitCode = 1;
  await app.close();
}
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => { void app.close(); });
}
