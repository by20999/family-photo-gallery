let photos = [];
let currentPhotoIndex = null;
let galleryObserver = null;

// 当前图片的滤镜和编辑状态
let currentFilter = 'none';
let currentEdit = { brightness: 100, contrast: 100, saturate: 100, blur: 0 };

// ===== 昵称系统 =====
const NICKNAME_KEY = 'album_nickname';

function getNickname() {
    return localStorage.getItem(NICKNAME_KEY) || '';
}

function setNickname(name) {
    localStorage.setItem(NICKNAME_KEY, name);
}

function getAvatarChar(name) {
    return name ? name.charAt(0).toUpperCase() : '?';
}

function updateUserBadge(name) {
    document.getElementById('userAvatar').textContent = getAvatarChar(name);
    document.getElementById('userName').textContent = name;
}

function openNicknameModal(required = false) {
    const modal = document.getElementById('nicknameModal');
    const input = document.getElementById('nicknameInput');
    input.value = getNickname();
    document.getElementById('nicknameError').textContent = '';
    modal.classList.add('open');
    // 如果是必填（首次），不允许点背景关闭
    modal._required = required;
    setTimeout(() => input.focus(), 100);
}

function closeNicknameModal() {
    document.getElementById('nicknameModal').classList.remove('open');
}

document.getElementById('nicknameConfirmBtn').addEventListener('click', () => {
    const input = document.getElementById('nicknameInput');
    const name = input.value.trim();
    if (name.length < 2) {
        document.getElementById('nicknameError').textContent = '昵称至少2个字';
        return;
    }
    setNickname(name);
    updateUserBadge(name);
    closeNicknameModal();
});

document.getElementById('nicknameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('nicknameConfirmBtn').click();
});

document.getElementById('nicknameModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('nicknameModal') && !e.target._required) {
        closeNicknameModal();
    }
});

document.getElementById('userEditBtn').addEventListener('click', () => openNicknameModal(false));

function initNickname() {
    const name = getNickname();
    if (!name) {
        openNicknameModal(true);
    } else {
        updateUserBadge(name);
    }
}

const fileInput = document.getElementById('fileInput');
const gallery = document.getElementById('gallery');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const closeBtn = document.querySelector('.close');
const deleteBtn = document.getElementById('deleteBtn');
const submitCommentBtn = document.getElementById('submitComment');
const commentInput = document.getElementById('commentInput');
const authorInput = document.getElementById('authorInput');
const commentsList = document.getElementById('commentsList');

// ===== 主题系统 =====
const THEME_KEY = 'album_theme';
const GRADIENT_KEY = 'album_gradient';

function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
    const savedGradient = localStorage.getItem(GRADIENT_KEY);
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
    if (savedGradient) {
        document.body.style.background = savedGradient;
        syncActivePreset(savedGradient);
    }
}

function updateThemeIcon(theme) {
    document.querySelector('.theme-icon').textContent = theme === 'dark' ? '☀️' : '🌙';
}

document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
    updateThemeIcon(next);
});

document.getElementById('themePanelBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('themeDropdown').classList.toggle('open');
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.theme-panel')) {
        document.getElementById('themeDropdown').classList.remove('open');
    }
});

// 预设主题色
document.querySelectorAll('.theme-preset').forEach(preset => {
    const gradient = preset.dataset.gradient;
    preset.style.background = gradient;
    preset.addEventListener('click', () => {
        applyGradient(gradient);
        syncActivePreset(gradient);
    });
});

function applyGradient(gradient) {
    document.body.style.background = gradient;
    localStorage.setItem(GRADIENT_KEY, gradient);
}

function syncActivePreset(gradient) {
    document.querySelectorAll('.theme-preset').forEach(p => {
        p.classList.toggle('active', p.dataset.gradient === gradient);
    });
}

document.getElementById('applyColorBtn').addEventListener('click', () => {
    const c1 = document.getElementById('colorStart').value;
    const c2 = document.getElementById('colorEnd').value;
    const gradient = `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;
    applyGradient(gradient);
    syncActivePreset(gradient);
});

// ===== 图片加载 =====
async function loadPhotos() {
    try {
        const response = await fetch('/api/photos');
        photos = await response.json();
        renderGallery();
    } catch (error) {
        console.error('加载图片失败:', error);
    }
}

async function loadPhotoDetails(photoId) {
    const response = await fetch(`/api/photos/${photoId}`);
    if (!response.ok) throw new Error('加载图片详情失败');
    return response.json();
}

// ===== 图片压缩 =====
function compressImage(file) {
    return new Promise((resolve) => {
        const maxSize = 1920;
        const quality = 0.85;
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);
            let { width, height } = img;
            if (width <= maxSize && height <= maxSize) { resolve(file); return; }
            if (width > height) {
                height = Math.round((height * maxSize) / width);
                width = maxSize;
            } else {
                width = Math.round((width * maxSize) / height);
                height = maxSize;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            canvas.toBlob(resolve, file.type, quality);
        };
        img.src = url;
    });
}

// ===== 文件上传 =====
fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    const uploadBtn = document.querySelector('.upload-btn');
    uploadBtn.textContent = '压缩中...';
    uploadBtn.style.pointerEvents = 'none';

    try {
        const formData = new FormData();
        for (const file of files) {
            const compressed = await compressImage(file);
            formData.append('photos', compressed, file.name);
        }
        uploadBtn.textContent = '上传中...';
        const response = await fetch('/api/upload', { method: 'POST', body: formData });
        if (response.ok) {
            await loadPhotos();
        } else {
            alert('上传失败，请重试');
        }
    } catch (error) {
        console.error('上传失败:', error);
        alert('上传失败，请检查网络连接');
    } finally {
        uploadBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg> 上传图片`;
        uploadBtn.style.pointerEvents = 'auto';
        fileInput.value = '';
    }
});

// ===== 渲染相册 =====
function renderGallery() {
    gallery.innerHTML = '';

    photos.forEach((photo, index) => {
        const card = document.createElement('div');
        card.className = 'photo-card';
        card.style.animationDelay = `${index * 0.1}s`;

        const img = document.createElement('img');
        img.dataset.src = photo.src;
        img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"%3E%3C/svg%3E';
        img.alt = photo.name;
        img.classList.add('lazy');

        const cardInfo = document.createElement('div');
        cardInfo.className = 'card-info';

        // 表情摘要（取前3个有数量的表情）
        const reactions = photo.reactions || {};
        const emojiMap = { '❤️': 'heart', '😂': 'laugh', '😮': 'wow', '😢': 'sad', '👍': 'like' };
        const reactionSummary = Object.entries(emojiMap)
            .filter(([emoji]) => reactions[emoji] > 0)
            .slice(0, 3)
            .map(([emoji]) => emoji)
            .join('');

        cardInfo.innerHTML = `
            <div class="likes-count">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
                <span>${(reactions['👍'] || 0) + (photo.likes || 0)}</span>
            </div>
            <div class="comments-count">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <span>${photo.commentsCount || 0}</span>
            </div>
            ${reactionSummary ? `<div class="card-reactions">${reactionSummary}</div>` : ''}
        `;

        card.appendChild(img);
        card.appendChild(cardInfo);
        card.addEventListener('click', () => openLightbox(index));
        gallery.appendChild(card);
    });

    if (galleryObserver) galleryObserver.disconnect();

    galleryObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.remove('lazy');
                galleryObserver.unobserve(img);
            }
        });
    }, { rootMargin: '300px 0px' });

    document.querySelectorAll('img.lazy').forEach(img => galleryObserver.observe(img));
}

// ===== 灯箱 =====
async function openLightbox(index) {
    currentPhotoIndex = index;
    const photo = photos[index];

    lightboxImg.src = photo.src;
    lightboxImg.style.filter = '';
    currentFilter = 'none';
    currentEdit = { brightness: 100, contrast: 100, saturate: 100, blur: 0 };
    resetEditSliders();
    resetFilterBtns();

    // 关闭编辑面板
    document.getElementById('filterBar').classList.remove('visible');
    document.getElementById('editBar').classList.remove('visible');
    document.getElementById('editToggleBtn').classList.remove('active');
    document.getElementById('editToggleBtn').textContent = '✏️ 编辑图片';

    commentsList.innerHTML = '<p style="color: #999; text-align: center;">评论加载中...</p>';
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';

    updateReactionUI(photo.reactions || {});

    try {
        const details = await loadPhotoDetails(photo.id);
        photos[index].likes = details.likes || 0;
        photos[index].comments = details.comments || [];
        photos[index].commentsCount = details.comments?.length || 0;
        photos[index].reactions = details.reactions || {};
        updateReactionUI(photos[index].reactions);
        renderComments(photos[index].comments);
        renderGallery();
    } catch (error) {
        commentsList.innerHTML = '<p style="color: #ff4757; text-align: center;">评论加载失败，请重试</p>';
        console.error('加载详情失败:', error);
    }
}

function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = 'auto';
    currentPhotoIndex = null;
    commentInput.value = '';
    authorInput.value = '';
}

// ===== 滤镜 =====
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        currentFilter = btn.dataset.filter;
        applyImageStyle();
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

function resetFilterBtns() {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.filter-btn[data-filter="none"]').classList.add('active');
}

// ===== 图片编辑 =====
const sliders = [
    { id: 'editBrightness', valId: 'brightnessVal', key: 'brightness', unit: '%' },
    { id: 'editContrast',   valId: 'contrastVal',   key: 'contrast',   unit: '%' },
    { id: 'editSaturate',   valId: 'saturateVal',   key: 'saturate',   unit: '%' },
    { id: 'editBlur',       valId: 'blurVal',       key: 'blur',       unit: 'px' },
];

sliders.forEach(({ id, valId, key, unit }) => {
    const input = document.getElementById(id);
    const valSpan = document.getElementById(valId);
    input.addEventListener('input', () => {
        currentEdit[key] = Number(input.value);
        valSpan.textContent = input.value + unit;
        applyImageStyle();
    });
});

function applyImageStyle() {
    const { brightness, contrast, saturate, blur } = currentEdit;
    const editFilter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) blur(${blur}px)`;
    const combined = currentFilter === 'none'
        ? editFilter
        : `${currentFilter} ${editFilter}`;
    lightboxImg.style.filter = combined;
}

function resetEditSliders() {
    sliders.forEach(({ id, valId, key, unit }) => {
        const defaults = { brightness: 100, contrast: 100, saturate: 100, blur: 0 };
        document.getElementById(id).value = defaults[key];
        document.getElementById(valId).textContent = defaults[key] + unit;
    });
}

document.getElementById('resetEditBtn').addEventListener('click', () => {
    currentEdit = { brightness: 100, contrast: 100, saturate: 100, blur: 0 };
    currentFilter = 'none';
    resetEditSliders();
    resetFilterBtns();
    lightboxImg.style.filter = '';
});

document.getElementById('saveEditBtn').addEventListener('click', () => {
    // 将当前滤镜效果渲染到 canvas 并触发下载
    const img = lightboxImg;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.filter = lightboxImg.style.filter || 'none';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `edited_${Date.now()}.jpg`;
        a.click();
        URL.revokeObjectURL(a.href);
    }, 'image/jpeg', 0.92);
});

// ===== 表情回应 =====
const emojiToId = { '❤️': 'react-heart', '😂': 'react-laugh', '😮': 'react-wow', '😢': 'react-sad', '👍': 'react-like' };
const reactedKey = (photoId) => `reacted_${photoId}`;

function updateReactionUI(reactions) {
    if (currentPhotoIndex === null) return;
    const photo = photos[currentPhotoIndex];
    const reacted = JSON.parse(localStorage.getItem(reactedKey(photo.id)) || 'null');

    Object.entries(emojiToId).forEach(([emoji, elId]) => {
        const el = document.getElementById(elId);
        if (el) el.textContent = reactions[emoji] || 0;
    });

    document.querySelectorAll('.reaction-btn').forEach(btn => {
        btn.classList.toggle('reacted', btn.dataset.emoji === reacted);
    });
}

document.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        if (currentPhotoIndex === null) return;
        const photo = photos[currentPhotoIndex];
        const emoji = btn.dataset.emoji;
        const alreadyReacted = localStorage.getItem(reactedKey(photo.id));

        // 已经点过同一个表情，不重复提交
        if (alreadyReacted === JSON.stringify(emoji)) return;

        try {
            const response = await fetch(`/api/photos/${photo.id}/react`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emoji })
            });

            if (response.ok) {
                const data = await response.json();
                photos[currentPhotoIndex].reactions = data.reactions;
                localStorage.setItem(reactedKey(photo.id), JSON.stringify(emoji));
                updateReactionUI(data.reactions);
                renderGallery();

                btn.classList.add('pop');
                setTimeout(() => btn.classList.remove('pop'), 300);
            }
        } catch (error) {
            console.error('表情回应失败:', error);
        }
    });
});

// ===== 评论 =====
function renderComments(comments) {
    commentsList.innerHTML = '';

    if (comments.length === 0) {
        commentsList.innerHTML = '<p style="color: #999; text-align: center;">还没有评论，快来抢沙发吧！</p>';
        return;
    }

    comments.forEach(comment => {
        const commentItem = document.createElement('div');
        commentItem.className = 'comment-item';

        const timeStr = new Date(comment.time).toLocaleString('zh-CN', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        const isOwn = comment.author === getNickname();

        commentItem.innerHTML = `
            <div class="comment-header">
                <span class="comment-author">${comment.author}</span>
                <span class="comment-time">${timeStr}</span>
            </div>
            <div class="comment-text">${comment.text}</div>
            ${isOwn ? `<button class="comment-delete" data-comment-id="${comment.id}">删除</button>` : ''}
        `;
        commentsList.appendChild(commentItem);
    });

    document.querySelectorAll('.comment-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            await deleteComment(e.target.dataset.commentId);
        });
    });
}

async function submitComment() {
    if (currentPhotoIndex === null) return;
    const text = commentInput.value.trim();
    if (!text) { alert('请输入评论内容'); return; }

    const photo = photos[currentPhotoIndex];
    const author = getNickname() || authorInput.value.trim() || '匿名';

    try {
        const response = await fetch(`/api/photos/${photo.id}/comment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, author })
        });

        if (response.ok) {
            const data = await response.json();
            photos[currentPhotoIndex].comments = photos[currentPhotoIndex].comments || [];
            photos[currentPhotoIndex].comments.push(data.comment);
            photos[currentPhotoIndex].commentsCount = photos[currentPhotoIndex].comments.length;
            renderComments(photos[currentPhotoIndex].comments);
            renderGallery();
            commentInput.value = '';
            authorInput.value = '';
        }
    } catch (error) {
        console.error('评论失败:', error);
        alert('评论失败，请重试');
    }
}

async function deleteComment(commentId) {
    if (currentPhotoIndex === null) return;
    const photo = photos[currentPhotoIndex];

    try {
        const response = await fetch(`/api/photos/${photo.id}/comment/${commentId}`, { method: 'DELETE' });
        if (response.ok) {
            photos[currentPhotoIndex].comments = (photos[currentPhotoIndex].comments || []).filter(c => c.id !== commentId);
            photos[currentPhotoIndex].commentsCount = photos[currentPhotoIndex].comments.length;
            renderComments(photos[currentPhotoIndex].comments);
            renderGallery();
        }
    } catch (error) {
        console.error('删除评论失败:', error);
        alert('删除失败，请重试');
    }
}

// ===== 删除图片（密码保护）=====
const pwdModal = document.getElementById('pwdModal');
const pwdInput = document.getElementById('pwdInput');
const pwdError = document.getElementById('pwdError');

function openPwdModal() {
    pwdInput.value = '';
    pwdError.textContent = '';
    pwdModal.classList.add('open');
    setTimeout(() => pwdInput.focus(), 100);
}

function closePwdModal() {
    pwdModal.classList.remove('open');
}

document.getElementById('pwdCancelBtn').addEventListener('click', closePwdModal);

pwdModal.addEventListener('click', (e) => {
    if (e.target === pwdModal) closePwdModal();
});

pwdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('pwdConfirmBtn').click();
    if (e.key === 'Escape') closePwdModal();
});

document.getElementById('pwdConfirmBtn').addEventListener('click', async () => {
    const password = pwdInput.value;
    if (!password) { pwdError.textContent = '请输入密码'; return; }
    if (currentPhotoIndex === null) { closePwdModal(); return; }

    const photo = photos[currentPhotoIndex];

    try {
        const response = await fetch(`/api/photos/${photo.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        if (response.ok) {
            closePwdModal();
            await loadPhotos();
            closeLightbox();
        } else {
            const data = await response.json();
            pwdError.textContent = data.error || '密码错误';
            pwdInput.value = '';
            pwdInput.focus();
        }
    } catch (error) {
        console.error('删除失败:', error);
        pwdError.textContent = '网络错误，请重试';
    }
});

async function deletePhoto() {
    if (currentPhotoIndex === null) return;
    openPwdModal();
}

// ===== 事件绑定 =====
closeBtn.addEventListener('click', closeLightbox);
deleteBtn.addEventListener('click', deletePhoto);
submitCommentBtn.addEventListener('click', submitComment);

// 编辑按钮切换
document.getElementById('editToggleBtn').addEventListener('click', () => {
    const filterBar = document.getElementById('filterBar');
    const editBar = document.getElementById('editBar');
    const btn = document.getElementById('editToggleBtn');
    const isOpen = filterBar.classList.contains('visible');
    filterBar.classList.toggle('visible', !isOpen);
    editBar.classList.toggle('visible', !isOpen);
    btn.classList.toggle('active', !isOpen);
    btn.textContent = isOpen ? '✏️ 编辑图片' : '✖ 关闭编辑';
});

commentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) submitComment();
});

lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
});

document.addEventListener('keydown', (e) => {
    if (lightbox.classList.contains('active')) {
        if (e.key === 'Escape') closeLightbox();
        else if (e.key === 'Delete') deletePhoto();
        else if (e.key === 'ArrowLeft' && currentPhotoIndex > 0) openLightbox(currentPhotoIndex - 1);
        else if (e.key === 'ArrowRight' && currentPhotoIndex < photos.length - 1) openLightbox(currentPhotoIndex + 1);
    }
});

// ===== 初始化 =====
initTheme();
initNickname();
loadPhotos();
