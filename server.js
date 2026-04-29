const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname);

const ACCEPTED_API_KEY_NAMES = ['GROQ_API_KEY', 'API', 'API_KEY', 'OPENAI_API_KEY', 'GROQ'];

function getGroqApiKey() {
  for (const name of ACCEPTED_API_KEY_NAMES) {
    if (process.env[name]) {
      console.log(`[Env] using ${name}`);
      return process.env[name];
    }
  }
  return undefined;
}

const mimeTypes = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=UTF-8' });
  response.end(JSON.stringify(payload));
}

function serveStaticFile(response, filePath) {
  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      console.error(`Static file missing: ${filePath}`);
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      response.end('Not found');
      return;
    }

    response.writeHead(200, { 'Content-Type': contentType });
    response.end(content);
  });
}

async function handleGroqProxy(request, response) {
  console.log(`[Proxy] ${request.method} ${request.url}`);

  const groqApiKey = getGroqApiKey();
  if (!groqApiKey) {
    sendJson(response, 500, {
      error: `Server missing API key. Set one of: ${ACCEPTED_API_KEY_NAMES.join(', ')}`
    });
    return;
  }

  let body = '';
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', async () => {
    try {
      const payload = JSON.parse(body || '{}');
      const prompt = payload.prompt;

      if (!prompt || typeof prompt !== 'string') {
        sendJson(response, 400, { error: 'Missing or invalid prompt in request body.' });
        return;
      }

      console.log(`[Proxy] prompt=${prompt.slice(0, 100)}`);

      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that Explains the input like i am 5 years old. Do not use symbols, just letters and simple punctuation. You may use capital letters. Only use capital letters when you need to. Only write like 1-2 sentences.'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });

      const data = await groqResponse.json();

      if (!groqResponse.ok) {
        const errorMessage = data?.error || groqResponse.statusText || 'Groq API error';
        console.error('[Proxy] Groq error:', errorMessage, data);
        sendJson(response, 502, { error: errorMessage, details: data });
        return;
      }

      const output = data?.choices?.[0]?.message?.content;
      console.log('[Proxy] success');
      sendJson(response, 200, { output, raw: data });
    } catch (error) {
      console.error('[Proxy] exception:', error);
      sendJson(response, 500, { error: error.message || 'Internal server error' });
    }
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  console.log(`[Server] ${request.method} ${url.pathname}`);

  if (url.pathname === '/api/groq') {
    if (request.method === 'POST') {
      handleGroqProxy(request, response);
    } else {
      sendJson(response, 405, { error: 'Method not allowed' });
    }
    return;
  }

  let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  serveStaticFile(response, filePath);
});

server.listen(PORT, '0.0.0.0', () => {
  const address = server.address();
  console.log(`Server listening on ${address.address}:${address.port}`);
  console.log("BODY RAW:", body);
});
