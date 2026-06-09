const http = require('http');

const port = process.env.PORT || 3000;

function request(pathname) {
    return new Promise((resolve, reject) => {
        const req = http.get({
            host: '127.0.0.1',
            port,
            path: pathname,
            timeout: 5000
        }, (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode));
        });

        req.on('timeout', () => {
            req.destroy(new Error(`Request timeout: ${pathname}`));
        });
        req.on('error', reject);
    });
}

(async () => {
    const checks = [
        ['/healthz', 200],
        ['/', 200],
        ['/api/photos', 200],
        ['/api/stories', 200]
    ];

    for (const [pathname, expected] of checks) {
        const status = await request(pathname);
        if (status !== expected) {
            throw new Error(`${pathname} expected ${expected}, received ${status}`);
        }
    }

    console.log('Healthcheck passed');
})().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
