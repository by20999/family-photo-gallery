const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FormData = require('form-data');

const port = process.env.SMOKE_PORT || 4321;
const smokePassword = 'smoke-test-password';

function request(pathname, options = {}) {
    return new Promise((resolve, reject) => {
        const body = options.body ? JSON.stringify(options.body) : '';
        const req = http.request({
            host: '127.0.0.1',
            port,
            path: pathname,
            method: options.method || 'GET',
            headers: {
                ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
                ...(options.headers || {})
            },
            timeout: 8000
        }, (res) => {
            let responseBody = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { responseBody += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, body: responseBody }));
        });
        req.on('timeout', () => req.destroy(new Error(`Request timeout: ${pathname}`)));
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

function postMultipart(pathname, form) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port,
            path: pathname,
            method: 'POST',
            headers: {
                ...form.getHeaders(),
                'X-Admin-Password': smokePassword
            },
            timeout: 8000
        }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('timeout', () => req.destroy(new Error(`Request timeout: ${pathname}`)));
        req.on('error', reject);
        form.pipe(req);
    });
}

async function waitForServer() {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        try {
            await request('/');
            return;
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    }
    throw new Error('Server did not become ready');
}

(async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'family-photo-gallery-smoke-'));
    const child = spawn(process.execPath, ['server.js'], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            PORT: String(port),
            DELETE_PASSWORD: smokePassword,
            RAILWAY_VOLUME_MOUNT_PATH: tempRoot
        },
        stdio: 'ignore'
    });

    try {
        await waitForServer();
        const expectations = [
            ['/healthz', 200],
            ['/', 200],
            ['/api/photos', 200],
            ['/api/stories', 200],
            ['/api/system/health', 200],
            ['/package.json', 404],
            ['/photo-data.json', 404],
            ['/api/photos/..%2Fphoto-data.json', 400]
        ];

        for (const [pathname, expected] of expectations) {
            const result = await request(pathname);
            if (result.status !== expected) {
                throw new Error(`${pathname} expected ${expected}, received ${result.status}`);
            }
        }

        const unauthorizedWrite = await request('/api/stories', {
            method: 'POST',
            body: { name: 'Smoke Unauthorized Story' }
        });
        if (unauthorizedWrite.status !== 403) {
            throw new Error(`/api/stories without password expected 403, received ${unauthorizedWrite.status}`);
        }

        const authorizedWrite = await request('/api/stories', {
            method: 'POST',
            headers: { 'X-Admin-Password': smokePassword },
            body: { name: 'Smoke Authorized Story' }
        });
        if (authorizedWrite.status !== 201) {
            throw new Error(`/api/stories with password expected 201, received ${authorizedWrite.status}`);
        }

        const pngBytes = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
            'base64'
        );
        const firstUploadForm = new FormData();
        firstUploadForm.append('caption', 'Smoke photo');
        firstUploadForm.append('eventDate', '2026-06-09');
        firstUploadForm.append('eventName', 'Smoke test');
        firstUploadForm.append('photos', pngBytes, { filename: 'smoke.png', contentType: 'image/png' });
        const firstUpload = await postMultipart('/api/upload', firstUploadForm);
        if (firstUpload.status !== 200) {
            throw new Error(`/api/upload first upload expected 200, received ${firstUpload.status}`);
        }
        const firstUploadBody = JSON.parse(firstUpload.body);
        const uploadedPhotoId = firstUploadBody.photos?.[0]?.id;
        if (!uploadedPhotoId) {
            throw new Error('/api/upload did not return uploaded photo id');
        }

        const batchDetails = await request('/api/photos/batch/details', {
            method: 'PATCH',
            headers: { 'X-Admin-Password': smokePassword },
            body: {
                photoIds: [uploadedPhotoId],
                caption: 'Smoke batch caption',
                tags: ['smoke', 'batch'],
                eventDate: '2026-06-10',
                eventName: 'Smoke batch'
            }
        });
        if (batchDetails.status !== 200) {
            throw new Error(`/api/photos/batch/details expected 200, received ${batchDetails.status}`);
        }

        const photoDetails = await request(`/api/photos/${encodeURIComponent(uploadedPhotoId)}`);
        if (photoDetails.status !== 200) {
            throw new Error(`/api/photos/:id expected 200, received ${photoDetails.status}`);
        }
        const photoDetailsBody = JSON.parse(photoDetails.body);
        if (photoDetailsBody.eventDate !== '2026-06-10' || photoDetailsBody.eventName !== 'Smoke batch') {
            throw new Error('/api/photos/:id did not return batch detail fields');
        }

        const duplicateUploadForm = new FormData();
        duplicateUploadForm.append('photos', pngBytes, { filename: 'smoke-copy.png', contentType: 'image/png' });
        const duplicateUpload = await postMultipart('/api/upload', duplicateUploadForm);
        if (duplicateUpload.status !== 409) {
            throw new Error(`/api/upload duplicate expected 409, received ${duplicateUpload.status}`);
        }

        const healthAfterUpload = await request('/api/system/health');
        const healthBody = JSON.parse(healthAfterUpload.body);
        if (healthBody.counts?.photos !== 1 || healthBody.counts?.metadata !== 1) {
            throw new Error('/api/system/health did not report uploaded smoke photo');
        }

        console.log('Smoke test passed');
    } finally {
        child.kill();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
})().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
