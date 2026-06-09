const { DELETE_PASSWORD } = require('../config');

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function getAdminPassword(req) {
    const headerValue = req.get('x-admin-password');
    if (typeof headerValue === 'string' && headerValue) return headerValue;
    if (typeof req.body?.password === 'string') return req.body.password;
    return '';
}

function requireAdminForWrite(req, res, next) {
    if (!WRITE_METHODS.has(req.method)) {
        next();
        return;
    }

    const password = getAdminPassword(req);
    if (!password || password !== DELETE_PASSWORD) {
        res.status(403).json({ error: '需要管理密码' });
        return;
    }

    next();
}

module.exports = {
    requireAdminForWrite
};
