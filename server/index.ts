import { buildApp } from './app.ts';

const port = Number(process.env.PORT || 8787);
const app = await buildApp();
await app.listen({ port, host: '0.0.0.0' });
app.log.info(`LevelUp AI proxy on :${port} — AI ${process.env.ANTHROPIC_API_KEY ? 'enabled' : 'disabled (no ANTHROPIC_API_KEY)'}`);
