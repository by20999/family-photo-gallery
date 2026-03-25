import { dom } from './dom.js';

const NICKNAME_KEY = 'album_nickname';

export function getNickname() {
    return localStorage.getItem(NICKNAME_KEY) || '';
}

function setNickname(name) {
    localStorage.setItem(NICKNAME_KEY, name);
}

function getAvatarChar(name) {
    return name ? name.charAt(0).toUpperCase() : '?';
}

function updateUserBadge(name) {
    dom.userAvatar.textContent = getAvatarChar(name);
    dom.userName.textContent = name;
}

function openNicknameModal(required = false) {
    dom.nicknameInput.value = getNickname();
    dom.nicknameError.textContent = '';
    dom.nicknameModal.classList.add('open');
    dom.nicknameModal._required = required;
    setTimeout(() => dom.nicknameInput.focus(), 100);
}

function closeNicknameModal() {
    dom.nicknameModal.classList.remove('open');
}

export function initNickname() {
    dom.nicknameConfirmBtn.addEventListener('click', () => {
        const name = dom.nicknameInput.value.trim();
        if (name.length < 2) {
            dom.nicknameError.textContent = '昵称至少2个字';
            return;
        }
        setNickname(name);
        updateUserBadge(name);
        closeNicknameModal();
    });

    dom.nicknameInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') dom.nicknameConfirmBtn.click();
    });

    dom.nicknameModal.addEventListener('click', (event) => {
        if (event.target === dom.nicknameModal && !dom.nicknameModal._required) {
            closeNicknameModal();
        }
    });

    dom.userEditBtn.addEventListener('click', () => openNicknameModal(false));

    const nickname = getNickname();
    if (!nickname) {
        openNicknameModal(true);
    } else {
        updateUserBadge(nickname);
    }
}