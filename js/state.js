export const GALLERY_IMAGE_PLACEHOLDER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"%3E%3C/svg%3E';
export const MAX_PARALLEL_IMAGE_LOADS = 4;
export const IMAGE_RETRY_LIMIT = 1;

export function createDefaultEditState() {
    return { brightness: 100, contrast: 100, saturate: 100, blur: 0 };
}

export const state = {
    photos: [],
    localUploadPreviews: [],
    visiblePhotos: [],
    currentPhotoIndex: null,
    galleryObserver: null,
    batchMode: false,
    selectedIds: new Set(),
    searchKeyword: '',
    activeTagFilter: '',
    loadErrorMessage: '',
    activeGroupName: '全部图片',
    sortMode: 'custom',
    contentFilter: 'all',
    draggedPhotoId: null,
    dragMoved: false,
    reorderSaving: false,
    currentFilter: 'none',
    currentEdit: createDefaultEditState(),
    imageLoadQueue: [],
    activeImageLoads: 0
};

export function setPhotos(photos) {
    state.photos = photos;
}

export function setLocalUploadPreviews(previews) {
    state.localUploadPreviews = previews;
}

export function setVisiblePhotos(photos) {
    state.visiblePhotos = photos;
}

export function updatePhotoInStore(photoId, patch) {
    state.photos = state.photos.map((photo) => (photo.id === photoId ? { ...photo, ...patch } : photo));
    state.visiblePhotos = state.visiblePhotos.map((photo) => (photo.id === photoId ? { ...photo, ...patch } : photo));
}

export function updateGroupCoverInStore(groupName, coverPhotoId) {
    const applyPatch = (photo) => (photo.groupName === groupName ? { ...photo, groupCoverPhotoId: coverPhotoId } : photo);
    state.photos = state.photos.map(applyPatch);
    state.visiblePhotos = state.visiblePhotos.map(applyPatch);
}

export function getCurrentPhoto() {
    return state.currentPhotoIndex === null ? null : state.visiblePhotos[state.currentPhotoIndex] || null;
}

export function resetEditorState() {
    state.currentFilter = 'none';
    state.currentEdit = createDefaultEditState();
}
