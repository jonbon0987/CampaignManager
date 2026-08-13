import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
    strictPort: false,
    proxy: {
      // The /api functions are served by `vercel dev` on port 3000, not by
      // Vite. If that isn't running, the proxy can't connect and Vite would
      // otherwise return a bare 502 with no body — surface a clear message so
      // the fix (start the API server) is obvious instead of a mystery.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            const message =
              'API server not reachable on http://localhost:3000. ' +
              'Start it in a separate terminal with:  vercel dev --listen 3000';
            const httpRes = res as unknown as {
              writeHead?: (status: number, headers: Record<string, string>) => void;
              end?: (body: string) => void;
              headersSent?: boolean;
            };
            if (httpRes.writeHead && httpRes.end && !httpRes.headersSent) {
              httpRes.writeHead(503, { 'Content-Type': 'application/json' });
              httpRes.end(JSON.stringify({ error: message }));
            }
          });
        },
      },
    },
  },
})
