import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
export default defineConfig({
  optimizeDeps: { entries: ['interview.html'] },
  plugins: [react(), tailwindcss(), { name: 'interview-spike', configureServer(server) {
    let service: any;
    server.middlewares.use('/spike-api', async (req, res) => {
      try {
        service ??= server.ssrLoadModule('/server/interview-spike.ts').then(m => m.createSpike({ base: process.env.LITZIO_INTERVIEW_ARTIFACT_DIR }));
        const api = await service;
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const input = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
        const result = await api.handle(req.method, req.url?.split('?')[0], input);
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result));
      } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: String((error as Error).message) })); }
    });
    server.httpServer?.once('close', () => { void service?.then((s: any) => s.close()); });
  }}],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  ssr: { noExternal: ['jsonc-parser'] },
  server: { host: '127.0.0.1', port: 5196, strictPort: true },
});
