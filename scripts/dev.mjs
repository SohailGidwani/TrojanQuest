import { pathToFileURL } from 'node:url';
import concurrently from 'concurrently';

export function developmentEnvironment(demo = false, env = process.env) {
  return { ...env, NODE_ENV: 'development', ...(demo ? { DEMO_MODE: 'true' } : {}) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = developmentEnvironment(process.argv.includes('--demo'));
  const { result } = concurrently([
    { command: 'npm run dev -w server', name: 'server', env },
    { command: 'npm run dev -w client', name: 'client', env },
  ], { prefix: 'name', killOthersOn: ['failure', 'success'] });
  try { await result; } catch { process.exitCode = 1; }
}
