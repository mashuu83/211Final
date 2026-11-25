const http = require('node:http');
const { readdir, readFile, stat } = require('node:fs/promises');
const path = require('node:path');

const rootDirectory = __dirname;
const imageDirectory = path.join(rootDirectory, 'assets', 'images');
const imageExtensions = new Set(['.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const contentTypes = {
    '.avif': 'image/avif',
    '.bmp': 'image/bmp',
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp'
};

function respond(response, status, body, contentType, method) {
    response.writeHead(status, {
        'Cache-Control': 'no-cache',
        'Content-Length': Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body),
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff'
    });
    response.end(method === 'HEAD' ? undefined : body);
}

async function getImageSources() {
    const entries = await readdir(imageDirectory, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase()))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => `./assets/images/${encodeURIComponent(name)}`);
}

const server = http.createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        respond(response, 405, 'Method not allowed', 'text/plain; charset=utf-8', request.method);
        return;
    }

    const requestUrl = new URL(request.url, 'http://localhost');
    if (requestUrl.pathname === '/api/images') {
        try {
            const body = JSON.stringify(await getImageSources());
            respond(response, 200, body, 'application/json; charset=utf-8', request.method);
        } catch (error) {
            console.error('Failed to scan assets/images:', error);
            respond(response, 500, 'Unable to list images', 'text/plain; charset=utf-8', request.method);
        }
        return;
    }

    let decodedPath;
    try {
        decodedPath = decodeURIComponent(requestUrl.pathname);
    } catch {
        respond(response, 400, 'Invalid URL path', 'text/plain; charset=utf-8', request.method);
        return;
    }

    const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.slice(1);
    const filePath = path.resolve(rootDirectory, relativePath);
    const pathFromRoot = path.relative(rootDirectory, filePath);
    if (pathFromRoot === '..' || pathFromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(pathFromRoot)) {
        respond(response, 403, 'Forbidden', 'text/plain; charset=utf-8', request.method);
        return;
    }

    try {
        const fileInfo = await stat(filePath);
        if (!fileInfo.isFile()) {
            respond(response, 404, 'Not found', 'text/plain; charset=utf-8', request.method);
            return;
        }

        const body = await readFile(filePath);
        const contentType = contentTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
        respond(response, 200, body, contentType, request.method);
    } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
            respond(response, 404, 'Not found', 'text/plain; charset=utf-8', request.method);
            return;
        }
        console.error(`Failed to serve ${decodedPath}:`, error);
        respond(response, 500, 'Unable to serve file', 'text/plain; charset=utf-8', request.method);
    }
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, '127.0.0.1', () => {
    console.log(`Canvas image server listening at http://127.0.0.1:${port}`);
});
