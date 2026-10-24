// Next loads .env.local for the web app; standalone tsx scripts need the same setup.
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());
