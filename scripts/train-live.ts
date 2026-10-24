// npm run train:live -- --examples 60 --output work/live-training-evidence.json
// Sends bounded billable gateway traffic. No feedback, refresh, storage, or named-adapter APIs.
import './env';
import { mkdir, open } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { getMubit, mubitMode } from '../lib/mubit';
import { cfg } from '../lib/mubit/config';
import { generateTrainingSamples, redactTrainingText, runTrainingTraffic, trainingTrafficSummary } from '../lib/train/traffic';

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: npm run train:live -- [--examples 1..200] [--output evidence.json]\nDefault: 60 examples, concurrency capped at 3. Requires real Mubit configuration.');
    return;
  }
  let examples = 60;
  let output: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${option}`);
    if (option === '--examples') examples = Number(value);
    else if (option === '--output') output = value;
    else throw new Error(`Unknown option: ${option}`);
  }
  generateTrainingSamples(examples); // Reject invalid bounds before obtaining any client.
  if (mubitMode() !== 'real') throw new Error('train:live requires real Mubit mode; configure MUBIT_ENABLED=true and MUBIT_BASE_URL');
  const config = cfg();
  const secrets = [config.apiKey, config.openaiApiKey];
  const path = output ? resolve(output) : undefined;
  if (path) await mkdir(dirname(path), { recursive: true });
  // Reserve the evidence file before spending; refuse accidental overwrites.
  const evidence = path ? await open(path, 'wx', 0o600) : undefined;
  try {
    console.log(`[train:live] source=scripted-state-real-gateway-output examples=${examples} concurrency=3 requested_model=${redactTrainingText(config.closedModel, secrets)}`);
    const report = await runTrainingTraffic(getMubit(), { examples, model: config.closedModel, concurrency: 3, secrets });
    if (evidence) {
      await evidence.writeFile(redactTrainingText(`${JSON.stringify(report, null, 2)}\n`, secrets));
      console.log(`[train:live] Evidence saved to ${path}`);
    }
    for (const record of report.records) {
      if (record.error) console.error(`[train:live] ${record.localId} ${record.status}: ${record.error}`);
    }
    console.log(`[train:live] ${trainingTrafficSummary(report)}`);
    process.exitCode = report.providerErrors || report.invalidOutputs || report.stoppedEarly ? 1 : 0;
  } finally {
    await evidence?.close();
  }
}

main().catch((error: unknown) => {
  const config = cfg();
  console.error(`[train:live] ${redactTrainingText(error instanceof Error ? error.message : String(error), [config.apiKey, config.openaiApiKey])}`);
  process.exitCode = 1;
});
