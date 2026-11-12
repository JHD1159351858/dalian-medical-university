import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { attachSpeechStream } from '../server/speechStream.mjs';

const dev =
  process.env.CODER_PROJECT_ENV !== 'PROD' &&
  process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.DEPLOY_RUN_PORT || process.env.PORT || '5000', 10);

if (dev) {
  const toMB = (bytes: number) => Math.round(bytes / 1024 / 1024);
  setInterval(() => {
    const m = process.memoryUsage();
    console.log(
      `[mem] rss=${toMB(m.rss)}MB heapTotal=${toMB(m.heapTotal)}MB heapUsed=${toMB(
        m.heapUsed,
      )}MB external=${toMB(m.external)}MB native=${toMB(m.rss - m.heapTotal - m.external)}MB`,
    );
  }, 120_000).unref();
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });
  attachSpeechStream(server);
  const upgrade = app.getUpgradeHandler();
  server.on('upgrade', (request, socket, head) => {
    if (request.url?.split('?')[0] === '/api/speech-stream') return;
    void upgrade(request, socket, head).catch(() => socket.destroy());
  });
  server.once('error', err => {
    console.error(err);
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${
        dev ? 'development' : process.env.CODER_PROJECT_ENV
      }`,
    );
  });
});
