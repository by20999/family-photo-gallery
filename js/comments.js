import { dom } from './dom.js';
import { getCurrentPhoto, updatePhotoInStore } from './state.js';
import { reactToPhoto, submitPhotoComment, deletePhotoComment } from './api.js';
import { escapeHtml } from './utils.js';
import { getNickname } from './profile.js';

const emojiToId = { '❤️': 'react-heart', '😂': 'react-laugh', '😮': 'react-wow', '😢': 'react-sad', '👍': 'react-like' };
const reactedKey = (photoId) => `reacted_${photoId}`;
let renderGalleryHandler = () => {};

export function updateReactionUI(reactions) {
    const photo = getCurrentPhoto();
    if (!photo) return;
    const reacted = JSON.parse(localStorage.getItem(reactedKey(photo.id)) || 'null');

    Object.entries(emojiToId).forEach(([emoji, elementId]) => {
        const element = document.getElementById(elementId);
        if (element) element.textContent = reactions[emoji] || 0;
    });

    dom.reactionBtns.forEach((btn) => {
        btn.classList.toggle('reacted', btn.dataset.emoji === reacted);
    });
}

async function deleteComment(commentId) {
    const photo = getCurrentPhoto();
    if (!photo) return;

    try {
        await deletePhotoComment(photo.id, commentId);
        const latest = getCurrentPhoto();
        const comments = (latest.comments || []).filter((comment) => comment.id !== commentId);
        updatePhotoInStore(photo.id, { comments, commentsCount: comments.length });
        renderComments(comments);
        renderGalleryHandler();
    } catch (error) {
        console.error('删除评论失败:', error);
        alert('删除失败，请重试');
    }
}

export function renderComments(comments) {
    dom.commentsList.innerHTML = '';

    if (!comments.length) {
        dom.commentsList.innerHTML = '<p style="color: #999; text-align: center;">还没有评论，快来抢沙发吧！</p>';
        return;
    }

    comments.forEach((comment) => {
        const commentItem = document.createElement('div');
        commentItem.className = 'comment-item';
        const timeStr = new Date(comment.time).toLocaleString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        const isOwn = comment.author === getNickname();

        commentItem.innerHTML = `
            <div class="comment-header">
                <span class="comment-author">${escapeHtml(comment.author)}</span>
                <span class="comment-time">${timeStr}</span>
            </div>
            <div class="comment-text">${escapeHtml(comment.text)}</div>
            ${isOwn ? `<button class="comment-delete" data-comment-id="${comment.id}">删除</button>` : ''}
        `;
        dom.commentsList.appendChild(commentItem);
    });

    document.querySelectorAll('.comment-delete').forEach((btn) => {
        btn.addEventListener('click', async (event) => {
            await deleteComment(event.target.dataset.commentId);
        });
    });
}

async function submitComment() {
    const photo = getCurrentPhoto();
    if (!photo) return;

    const text = dom.commentInput.value.trim();
    if (!text) {
        alert('请输入评论内容');
        return;
    }

    const author = getNickname() || dom.authorInput.value.trim() || '匿名';

    try {
        const data = await submitPhotoComment(photo.id, text, author);
        const latest = getCurrentPhoto();
        const comments = [...(latest.comments || []), data.comment];
        updatePhotoInStore(photo.id, { comments, commentsCount: comments.length });
        renderComments(comments);
        renderGalleryHandler();
        dom.commentInput.value = '';
        dom.authorInput.value = '';
    } catch (error) {
        console.error('评论失败:', error);
        alert('评论失败，请重试');
    }
}

export function initComments({ onRenderGallery }) {
    renderGalleryHandler = onRenderGallery;

    dom.reactionBtns.forEach((btn) => {
        btn.addEventListener('click', async () => {
            const photo = getCurrentPhoto();
            if (!photo) return;

            const emoji = btn.dataset.emoji;
            const alreadyReacted = localStorage.getItem(reactedKey(photo.id));
            if (alreadyReacted === JSON.stringify(emoji)) return;

            try {
                const data = await reactToPhoto(photo.id, emoji);
                updatePhotoInStore(photo.id, { reactions: data.reactions });
                localStorage.setItem(reactedKey(photo.id), JSON.stringify(emoji));
                updateReactionUI(data.reactions);
                renderGalleryHandler();
                btn.classList.add('pop');
                setTimeout(() => btn.classList.remove('pop'), 300);
            } catch (error) {
                console.error('表情回应失败:', error);
            }
        });
    });

    dom.submitCommentBtn.addEventListener('click', submitComment);
    dom.commentInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.ctrlKey) submitComment();
    });
}