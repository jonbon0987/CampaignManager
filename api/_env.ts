import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local explicitly — vercel dev pulls from cloud and may not have
// server-side vars set correctly in local development.
config({ path: resolve(process.cwd(), '.env.local'), override: true });
