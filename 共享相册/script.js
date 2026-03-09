let photos = [];
let currentPhotoIndex = null;

const fileInput = document.getElementById('fileInput');
const gallery = document.getElementById('gallery');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const closeBtn = document.querySelector('.close');
const deleteBtn = document.getElementById('deleteBtn');
const likeBtn = document.getElementById('likeBtn');
const likeCount = document.getElementById('likeCount');
const submitCommentBtn = document.getElementById('submitComment');
const commentInput = document.getElementById('commentInput');
const authorInput = document.getElementById('authorInput');
const commentsList = document.getElementById('commentsList');

// 从服务器加载图片
async function loadPhotos() {
    try {
        const response = await fetch('/api/photos');
        photos = await response.json();
        renderGallery();
    } catch (error) {
        console.error('加载图片失败:', error);
    }
}

// 文件选择处理 - 上传到服务器
fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);

    if (files.length === 0) return;

    const formData = new FormData();
    files.forEach(file => {
        if (file.type.startsWith('image/')) {
            formData.append('photos', file);
        }
    });

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            await loadPhotos(); // 重新加载所有图片
        } else {
            alert('上传失败，请重试');
        }
    } catch (error) {
        console.error('上传失败:', error);
        alert('上传失败，请检查网络连接');
    }

    fileInput.value = '';
});

// 渲染相册
function renderGallery() {
    gallery.innerHTML = '';

    photos.forEach((photo, index) => {
        const card = document.createElement('div');
        card.className = 'photo-card';
        card.style.animationDelay = `${index * 0.1}s`;

        const img = document.createElement('img');
        img.src = photo.src;
        img.alt = photo.name;

        const cardInfo = document.createElement('div');
        cardInfo.className = 'card-info';

        const likesCount = document.createElement('div');
        likesCount.className = 'likes-count';
        likesCount.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            <span>${photo.likes || 0}</span>
        `;

        const commentsCount = document.createElement('div');
        commentsCount.className = 'comments-count';
        commentsCount.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span>${photo.comments?.length || 0}</span>
        `;

        cardInfo.appendChild(likesCount);
        cardInfo.appendChild(commentsCount);

        card.appendChild(img);
        card.appendChild(cardInfo);
        card.addEventListener('click', () => openLightbox(index));

        gallery.appendChild(card);
    });
}

// 打开灯箱
function openLightbox(index) {
    currentPhotoIndex = index;
    const photo = photos[index];

    lightboxImg.src = photo.src;
    likeCount.textContent = photo.likes || 0;

    renderComments(photo.comments || []);

    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// 渲染评论列表
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
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        commentItem.innerHTML = `
            <div class="comment-header">
                <span class="comment-author">${comment.author}</span>
                <span class="comment-time">${timeStr}</span>
            </div>
            <div class="comment-text">${comment.text}</div>
            <button class="comment-delete" data-comment-id="${comment.id}">删除</button>
        `;

        commentsList.appendChild(commentItem);
    });

    // 绑定删除评论事件
    document.querySelectorAll('.comment-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const commentId = e.target.dataset.commentId;
            await deleteComment(commentId);
        });
    });
}

// 关闭灯箱
function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = 'auto';
    currentPhotoIndex = null;
    commentInput.value = '';
    authorInput.value = '';
}

// 点赞图片
async function likePhoto() {
    if (currentPhotoIndex === null) return;

    const photo = photos[currentPhotoIndex];

    try {
        const response = await fetch(`/api/photos/${photo.id}/like`, {
            method: 'POST'
        });

        if (response.ok) {
            const data = await response.json();
            photos[currentPhotoIndex].likes = data.likes;
            likeCount.textContent = data.likes;

            // 添加点赞动画
            likeBtn.classList.add('liked');
            setTimeout(() => likeBtn.classList.remove('liked'), 300);

            renderGallery();
        }
    } catch (error) {
        console.error('点赞失败:', error);
    }
}

// 提交评论
async function submitComment() {
    if (currentPhotoIndex === null) return;

    const text = commentInput.value.trim();
    if (!text) {
        alert('请输入评论内容');
        return;
    }

    const photo = photos[currentPhotoIndex];
    const author = authorInput.value.trim() || '匿名';

    try {
        const response = await fetch(`/api/photos/${photo.id}/comment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, author })
        });

        if (response.ok) {
            const data = await response.json();
            photos[currentPhotoIndex].comments.push(data.comment);

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

// 删除评论
async function deleteComment(commentId) {
    if (currentPhotoIndex === null) return;

    const photo = photos[currentPhotoIndex];

    try {
        const response = await fetch(`/api/photos/${photo.id}/comment/${commentId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            photos[currentPhotoIndex].comments = photos[currentPhotoIndex].comments.filter(
                c => c.id !== commentId
            );

            renderComments(photos[currentPhotoIndex].comments);
            renderGallery();
        }
    } catch (error) {
        console.error('删除评论失败:', error);
        alert('删除失败，请重试');
    }
}

// 删除图片 - 从服务器删除
async function deletePhoto() {
    if (currentPhotoIndex !== null) {
        const photo = photos[currentPhotoIndex];

        try {
            const response = await fetch(`/api/photos/${photo.id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                await loadPhotos(); // 重新加载图片列表
                closeLightbox();
            } else {
                alert('删除失败，请重试');
            }
        } catch (error) {
            console.error('删除失败:', error);
            alert('删除失败，请检查网络连接');
        }
    }
}

// 事件监听
closeBtn.addEventListener('click', closeLightbox);
deleteBtn.addEventListener('click', deletePhoto);
likeBtn.addEventListener('click', likePhoto);
submitCommentBtn.addEventListener('click', submitComment);

// 回车提交评论
commentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
        submitComment();
    }
});

lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) {
        closeLightbox();
    }
});

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    if (lightbox.classList.contains('active')) {
        if (e.key === 'Escape') {
            closeLightbox();
        } else if (e.key === 'Delete') {
            deletePhoto();
        } else if (e.key === 'ArrowLeft' && currentPhotoIndex > 0) {
            openLightbox(currentPhotoIndex - 1);
        } else if (e.key === 'ArrowRight' && currentPhotoIndex < photos.length - 1) {
            openLightbox(currentPhotoIndex + 1);
        }
    }
});

// 页面加载时加载图片
loadPhotos();
