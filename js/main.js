import { dom } from './dom.js';
import { initTheme } from './theme.js';
import { initNickname } from './profile.js';
import { initGallery, loadPhotos, renderGallery, exitBatchMode } from './gallery.js';
import { initComments } from './comments.js';
import { initDeleteFlow, openBatchDeleteModal, openSingleDeleteModal, openGroupDeleteModal } from './delete.js';
import { initLightbox, openLightbox, closeLightbox } from './lightbox.js';
import { initUpload } from './upload.js';

const subtitles = [
    '把散落在日子里的笑脸，留在同一本家庭相册里',
    '今天上传的每一张，都会成为以后最想重看的那一张',
    '给照片配上一句描述，回忆会比画面更完整',
    '试试标签和分组，让旅行、生日、团聚都更好找'
];

function startSubtitleRotation() {
    let subtitleIndex = 0;
    setInterval(() => {
        dom.dynamicSubtitle.style.opacity = '0';
        setTimeout(() => {
            subtitleIndex = (subtitleIndex + 1) % subtitles.length;
            dom.dynamicSubtitle.textContent = subtitles[subtitleIndex];
            dom.dynamicSubtitle.style.opacity = '1';
        }, 400);
    }, 3500);
}

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
    onOpenSingleDeleteModal: openSingleDeleteModal
});
initGallery({
    onOpenLightbox: openLightbox,
    onOpenBatchDeleteModal: openBatchDeleteModal,
    onOpenGroupDeleteModal: openGroupDeleteModal
});
initUpload({ onLoadPhotos: loadPhotos });
startSubtitleRotation();
loadPhotos();