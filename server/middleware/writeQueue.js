let tail = Promise.resolve();

function queueWriteRequest(req, res, next) {
    let release;
    const current = new Promise((resolve) => {
        release = resolve;
    });
    const previous = tail;
    tail = tail.then(() => current, () => current);

    previous.finally(() => {
        let released = false;
        const releaseOnce = () => {
            if (released) return;
            released = true;
            release();
        };

        res.once('finish', releaseOnce);
        res.once('close', releaseOnce);
        next();
    });
}

module.exports = {
    queueWriteRequest
};
