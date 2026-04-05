import { dom } from './dom.js';
import { state, getCurrentPhoto } from './state.js';
import { deletePhotoRequest, deleteGroupRequest } from './api.js';

let loadPhotosHandler = async () => {};
let closeLightboxHandler = () => {};
let exitBatchModeHandler = () => {};

function resetPwdModalState() {
    dom.pwdModal._batchMode = false;
    dom.pwdModal._customConfirm = null;
}

function closePwdModal() {
    dom.pwdModal.classList.remove('open');
    resetPwdModalState();
}

function preparePwdModal() {
    dom.pwdInput.value = '';
    dom.pwdError.textContent = '';
    dom.pwdModal.classList.add('open');
    setTimeout(() => dom.pwdInput.focus(), 100);
}

export function openSingleDeleteModal() {
    if (!getCurrentPhoto()) return;
    resetPwdModalState();
    dom.pwdModal._batchMode = false;
    preparePwdModal();
}

export function openBatchDeleteModal() {
    if (state.selectedIds.size === 0) return;
    resetPwdModalState();
    dom.pwdModal._batchMode = true;
    preparePwdModal();
}

export function openGroupDeleteModal(groupName) {
    const normalized = typeof groupName === 'string' ? groupName.trim() : '';
    if (!normalized || normalized === '\u5168\u90e8\u56fe\u7247') return;
    resetPwdModalState();
    dom.pwdModal._customConfirm = async (password) => {
        await deleteGroupRequest(normalized, password);
        closePwdModal();
        await loadPhotosHandler();
    };
    preparePwdModal();
}

async function handlePasswordConfirm() {
    const password = dom.pwdInput.value;

    if (!password) {
        dom.pwdError.textContent = '\u8bf7\u8f93\u5165\u5bc6\u7801';
        return;
    }

    if (typeof dom.pwdModal._customConfirm === 'function') {
        try {
            await dom.pwdModal._customConfirm(password);
        } catch (error) {
            console.error('\u5bc6\u7801\u64cd\u4f5c\u5931\u8d25:', error);
            dom.pwdError.textContent = error.message || '\u7f51\u7edc\u9519\u8bef\uff0c\u8bf7\u91cd\u8bd5';
            dom.pwdInput.value = '';
            dom.pwdInput.focus();
        }
        return;
    }

    if (dom.pwdModal._batchMode) {
        const ids = [...state.selectedIds];
        let failed = 0;
        for (const id of ids) {
            try {
                await deletePhotoRequest(id, password);
            } catch (error) {
                if (error.message === '\u5bc6\u7801\u9519\u8bef') {
                    dom.pwdError.textContent = '\u5bc6\u7801\u9519\u8bef';
                    dom.pwdInput.value = '';
                    dom.pwdInput.focus();
                    return;
                }
                failed += 1;
            }
        }

        resetPwdModalState();
        closePwdModal();
        exitBatchModeHandler();
        await loadPhotosHandler();
        if (failed > 0) alert(`${failed} \u5f20\u5220\u9664\u5931\u8d25`);
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
        console.error('\u5220\u9664\u5931\u8d25:', error);
        dom.pwdError.textContent = error.message || '\u7f51\u7edc\u9519\u8bef\uff0c\u8bf7\u91cd\u8bd5';
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
