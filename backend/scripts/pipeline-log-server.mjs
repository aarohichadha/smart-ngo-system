import http from 'node:http';

const port = Number(process.env.PORT || 8787);

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/log') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    try {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const payload = rawBody ? JSON.parse(rawBody) : {};
      const timestamp = new Date().toISOString();
      const scope = payload.scope || 'PIPELINE';
      const level = (payload.level || 'log').toUpperCase();
      const message = payload.message || '';
      const details = payload.details && Object.keys(payload.details).length > 0
        ? ` ${JSON.stringify(payload.details)}`
        : '';

      console.log(`[${timestamp}] [${scope}] [${level}] ${message}${details}`);

      res.writeHead(204);
      res.end();
    } catch (error) {
      console.error('[PIPELINE_LOG_SERVER] Failed to parse log payload:', error);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
    }
  });
});

server.listen(port, () => {
  console.log(`[PIPELINE_LOG_SERVER] Listening on http://localhost:${port}`);
});
