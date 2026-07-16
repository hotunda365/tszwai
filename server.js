const http = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const port = Number(process.env.PORT) || 3000;
const publicDirectory = __dirname;

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function resolveFilePath(requestUrl) {
  const pathname = new URL(requestUrl, 'http://localhost').pathname;
  const requestedFile = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.resolve(publicDirectory, requestedFile);

  return filePath.startsWith(`${publicDirectory}${path.sep}`) || filePath === publicDirectory
    ? filePath
    : null;
}

const server = http.createServer(async (request, response) => {
  if (!request.url || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  const filePath = resolveFilePath(request.url);

  if (!filePath) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const body = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();

    response.writeHead(200, {
      'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=86400',
      'Content-Type': contentTypes[extension] || 'application/octet-stream',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    console.error(error);
    response.writeHead(500);
    response.end('Internal server error');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Mindful Session is listening on port ${port}`);
});