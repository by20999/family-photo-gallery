import { dom } from './dom.js';
import { state, getCurrentPhoto } from './state.js';
import { deletePhotoRequest } from './api.js';

let loadPhotosHandler = async () => {};
let closeLightboxHandler = () => {};
let exitBatchModeHandler = () => {};

function closePwdModal() {
    dom.pwdModal.classList.remove('open');
}

export function openSingleDeleteModal() {
    if (!getCurrentPhoto()) return;
    dom.pwdInput.value = '';
    dom.pwdError.textContent = '';
    dom.pwdModal._batchMode = false;
    dom.pwdModal.classList.add('open');
    setTimeout(() => dom.pwdInput.focus(), 100);
}

export function openBatchDeleteModal() {
    if (state.selectedIds.size === 0) return;
    dom.pwdInput.value = '';
    dom.pwdError.textContent = '';
    dom.pwdModal._batchMode = true;
    dom.pwdModal.classList.add('open');
    setTimeout(() => dom.pwdInput.focus(), 100);
}

async function handlePasswordConfirm() {
    const password = dom.pwdInput.value;

    if (!password) {
        dom.pwdError.textContent = '请输入密码';
        return;
    }

    if (dom.pwdModal._batchMode) {
        const ids = [...state.selectedIds];
        let failed = 0;
        for (const id of ids) {
            try {
                await deletePhotoRequest(id, password);
            } catch (error) {
                if (error.message === '密码错误') {
                    dom.pwdError.textContent = '密码错误';
                    dom.pwdInput.value = '';
                    dom.pwdInput.focus();
                    return;
                }
                failed += 1;
            }
        }

        dom.pwdModal._batchMode = false;
        closePwdModal();
        exitBatchModeHandler();
        await loadPhotosHandler();
        if (failed > 0) alert(`${failed} 张删除失败`);
        return;
    }

    const photo = getCurrentPhoto();
    if (!photo) {
        closePwdModal();
        return;
    }

    try {
        await deletePhotoRequest(photo.id, password);
        closePwdModal();
        await loadPhotosHandler();
        closeLightboxHandler();
    } catch (error) {
        console.error('删除失败:', error);
        dom.pwdError.textContent = error.message || '网络错误，请重试';
        dom.pwdInput.value = '';
        dom.pwdInput.focus();
    }
}

export function initDeleteFlow({ onLoadPhotos, onCloseLightbox, onExitBatchMode }) {
    loadPhotosHandler = onLoadPhotos;
    closeLightboxHandler = onCloseLightbox;
    exitBatchModeHandler = onExitBatchMode;

    dom.pwdCancelBtn.addEventListener('click', closePwdModal);
    dom.pwdModal.addEventListener('click', (event) => {
        if (event.target === dom.pwdModal) closePwdModal();
    });
    dom.pwdInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') handlePasswordConfirm();
        if (event.key === 'Escape') closePwdModal();
    });
    dom.pwdConfirmBtn.addEventListener('click', handlePasswordConfirm);
}