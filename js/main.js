import { dom } from './dom.js';
import { initTheme } from './theme.js';
import { initNickname } from './profile.js';
import { initGallery, loadPhotos, renderGallery, exitBatchMode } from './gallery.js';
import { initComments } from './comments.js';
import { initDeleteFlow, openBatchDeleteModal, openSingleDeleteModal, openGroupDeleteModal } from './delete.js';
import { initLightbox, openLightbox, closeLightbox } from './lightbox.js';
import { initUpload } from './upload.js';
import { state } from './state.js';

function getDayPhaseLabel() {
    const hour = new Date().getHours();
    if (hour < 5) return '夜深时分';
    if (hour < 11) return '清晨到午前';
    if (hour < 14) return '午后开场';
    if (hour < 18) return '傍晚之前';
    if (hour < 22) return '夜色刚刚亮起';
    return '深夜档';
}

function buildDynamicSubtitles() {
    const total = state.photos.length;
    const captionedCount = state.photos.filter((photo) => Boolean(String(photo.caption || '').trim())).length;
    const favoriteCount = state.photos.filter((photo) => photo.favorited).length;
    const groupedCount = state.photos.filter((photo) => Boolean(String(photo.groupName || '').trim())).length;
    const phaseLabel = getDayPhaseLabel();
    const lines = [
        `${phaseLabel}，很适合回来翻一页自己的照片流。`,
        total === 0
            ? '先放进第一张照片吧，这里会慢慢长成你的私人视觉档案。'
            : total < 12
                ? `已经存下 ${total} 张照片，这本相册正在长出自己的气质。`
                : `你已经收进了 ${total} 张照片，足够拼出一条很完整的个人时间线。`,
        captionedCount === 0
            ? '给任意一张补一句描述，画面会立刻从存档变成片段。'
            : `已经有 ${captionedCount} 张照片写下了描述，故事感正在慢慢变浓。`,
        favoriteCount === 0
            ? '看到特别想反复点开的那张，就顺手给它一个收藏标记。'
            : `${favoriteCount} 张照片已经被你特别收起，主页开始有了自己的偏爱。`,
        groupedCount === 0
            ? '试试把照片分进不同小册子里，浏览时会更像翻一本杂志。'
            : `${groupedCount} 张照片已经归进分组，整理感会让整个站点更耐看。`
    ];
    return [...new Set(lines.filter(Boolean))];
}

function startSubtitleRotation() {
    let subtitleIndex = 0;
    const renderSubtitle = (nextIndex = subtitleIndex) => {
        const subtitles = buildDynamicSubtitles();
        if (subtitles.length === 0) return;
        subtitleIndex = nextIndex % subtitles.length;
        dom.dynamicSubtitle.textContent = subtitles[subtitleIndex];
        dom.dynamicSubtitle.style.opacity = '1';
    };

    renderSubtitle(0);
    setInterval(() => {
        const subtitles = buildDynamicSubtitles();
        if (subtitles.length === 0) return;
        dom.dynamicSubtitle.style.opacity = '0';
        setTimeout(() => {
            renderSubtitle(subtitleIndex + 1);
        }, 400);
    }, 3800);
}

async function bootstrap() {
    initTheme();
    initNickname();
    initComments({ onRenderGallery: renderGallery });
    initDeleteFlow({
        onLoadPhotos: loadPhotos,
        onCloseLightbox: closeLightbox,
        onExitBatchMode: exitBatchMode
    });
    initLightbox({
        onRenderGallery: renderGallery,
        onOpenSingleDeleteModal: openSingleDeleteModal,
        onLoadPhotos: loadPhotos
    });
    initGallery({
        onOpenLightbox: openLightbox,
        onOpenBatchDeleteModal: openBatchDeleteModal,
        onOpenGroupDeleteModal: openGroupDeleteModal
    });
    initUpload({ onLoadPhotos: loadPhotos });
    await loadPhotos();
    startSubtitleRotation();
}

bootstrap();