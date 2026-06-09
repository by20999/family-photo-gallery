import { dom } from './dom.js';
import { state, setStories, getActiveStory, replaceStoryInStore, removeStoryFromStore } from './state.js';
import {
    addStoryItemsRequest,
    createStoryRequest,
    deleteStoryItemRequest,
    deleteStoryRequest,
    fetchStories,
    updateStoryItemsLayoutRequest,
    updateStoryRequest
} from './api.js';
import { showStatusNotice } from './feedback.js';
import { escapeHtml, formatUploadDate, formatUploadMonth } from './utils.js';

const STORY_TIMELINE = {
    step: 240,
    height: 420,
    padding: 150,
    midY: 210,
    waveAmplitude: 68,
    offsetAmplitude: 42,
    maxOffset: 1,
    minY: 92,
    maxY: 328,
    nudgeStep: 0.14
};

let autosaveTimer = null;
let viewportDragState = null;
let nodeDragState = null;

function clampStoryOffset(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(-STORY_TIMELINE.maxOffset, Math.min(STORY_TIMELINE.maxOffset, numeric));
}

function roundStoryOffset(value) {
    return Math.round(clampStoryOffset(value) * 100) / 100;
}

function cloneStory(story) {
    if (!story) return null;
    return {
        ...story,
        coverPhoto: story.coverPhoto ? { ...story.coverPhoto } : story.coverPhoto,
        items: Array.isArray(story.items)
            ? story.items.map((item) => ({
                ...item,
                photo: item.photo ? { ...item.photo } : item.photo
            }))
            : []
    };
}

function withStoryItems(story, items) {
    const nextItems = items.map((item, index) => ({
        ...item,
        position: index,
        curveOffset: roundStoryOffset(item.curveOffset)
    }));
    return {
        ...story,
        items: nextItems,
        itemCount: nextItems.length,
        coverPhoto: nextItems[0]?.photo || null,
        updatedAt: new Date().toISOString()
    };
}

function buildLayoutPayload(items) {
    return items.map((item, index) => ({
        id: item.id,
        position: index,
        curveOffset: roundStoryOffset(item.curveOffset)
    }));
}

function hasLayoutChanged(previousStory, nextStory) {
    const prevItems = previousStory?.items || [];
    const nextItems = nextStory?.items || [];
    if (prevItems.length !== nextItems.length) return true;
    return prevItems.some((item, index) => (
        item.id !== nextItems[index]?.id
        || roundStoryOffset(item.curveOffset) !== roundStoryOffset(nextItems[index]?.curveOffset)
    ));
}

function ensureActiveStory() {
    if (!state.stories.some((story) => story.id === state.activeStoryId)) {
        state.activeStoryId = state.stories[0]?.id || '';
    }
}

function updateActiveStory(story) {
    replaceStoryInStore(story);
    if (!state.activeStoryId) {
        state.activeStoryId = story.id;
    }
    ensureActiveStory();
}

function setEditorStatus(text) {
    if (dom.storyEditorStatus) {
        dom.storyEditorStatus.textContent = text;
    }
}

function getStoryChoicePrompt() {
    return state.stories
        .map((story, index) => `${index + 1}. ${story.name}`)
        .join('\n');
}

function getTimelineWidth(itemCount, viewportWidth = dom.storyFlowViewport?.clientWidth || 960) {
    return Math.max(viewportWidth - 32, STORY_TIMELINE.padding * 2 + Math.max(itemCount - 1, 0) * STORY_TIMELINE.step + 240);
}

function getBasePointForIndex(index) {
    return {
        x: STORY_TIMELINE.padding + index * STORY_TIMELINE.step,
        y: STORY_TIMELINE.midY + Math.sin(index * 0.92) * STORY_TIMELINE.waveAmplitude
    };
}

function getStoryPoints(items) {
    return items.map((item, index) => {
        const base = getBasePointForIndex(index);
        return {
            x: base.x,
            y: base.y + (roundStoryOffset(item.curveOffset) * STORY_TIMELINE.offsetAmplitude)
        };
    });
}

function clampStoryPointX(x, itemCount) {
    const minX = STORY_TIMELINE.padding - 40;
    const maxX = STORY_TIMELINE.padding + Math.max(itemCount - 1, 0) * STORY_TIMELINE.step + 40;
    return Math.max(minX, Math.min(maxX, x));
}

function clampStoryPointY(y) {
    return Math.max(STORY_TIMELINE.minY, Math.min(STORY_TIMELINE.maxY, y));
}

function getTargetInsertIndex(x, itemCount) {
    if (itemCount <= 1) return 0;
    const rawIndex = Math.round((x - STORY_TIMELINE.padding) / STORY_TIMELINE.step);
    return Math.max(0, Math.min(itemCount - 1, rawIndex));
}

function getCurveOffsetForPoint(index, y) {
    const basePoint = getBasePointForIndex(index);
    return roundStoryOffset((clampStoryPointY(y) - basePoint.y) / STORY_TIMELINE.offsetAmplitude);
}

function buildStoryPath(points) {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        const controlX = (previous.x + current.x) / 2;
        path += ` C ${controlX} ${previous.y}, ${controlX} ${current.y}, ${current.x} ${current.y}`;
    }
    return path;
}

function buildTimelineMetaText(itemCount) {
    return `共 ${itemCount} 张图片，拖动节点可重排顺序，也可以用上移/下移做更细的流线微调。`;
}

function buildDragMetaText(targetIndex, curveOffset) {
    const direction = curveOffset > 0 ? '向下' : curveOffset < 0 ? '向上' : '归中';
    const intensity = Math.abs(Math.round(curveOffset * 100));
    return `拖动中：松开后会排到第 ${targetIndex + 1} 张，节点${direction}${intensity}% 。`;
}

function buildStoryCard(story) {
    const active = story.id === state.activeStoryId;
    const cover = story.coverPhoto
        ? `<img src="${escapeHtml(story.coverPhoto.thumbSrc || story.coverPhoto.src)}" alt="${escapeHtml(story.name)}">`
        : '<div class="story-list-cover-fallback">忆</div>';

    return `
        <button class="story-list-card${active ? ' active' : ''}" type="button" data-story-id="${escapeHtml(story.id)}" aria-pressed="${active ? 'true' : 'false'}">
            <div class="story-list-cover">${cover}</div>
            <div class="story-list-meta">
                <strong>${escapeHtml(story.name)}</strong>
                <span>${story.itemCount || story.items?.length || 0} 张图片</span>
                <em>${escapeHtml(formatUploadMonth(story.updatedAt) || '刚刚整理')}</em>
            </div>
        </button>
    `;
}

function buildStoryNode(item, point, index) {
    const photo = item.photo || {};
    const tags = (photo.tags || []).slice(0, 3).map((tag) => `<span class="story-node-tag">#${escapeHtml(tag)}</span>`).join('');
    const sourceLabel = item.sourceType === 'group' && item.sourceGroupName
        ? `来自分组 · ${escapeHtml(item.sourceGroupName)}`
        : '来自主相册';

    return `
        <article class="story-node" data-story-item-id="${escapeHtml(item.id)}" data-story-item-index="${index}" style="left:${point.x}px; top:${point.y}px; animation-delay:${(index * 0.06).toFixed(2)}s;">
            <div class="story-node-dot"></div>
            <div class="story-node-card">
                <button class="story-node-remove" type="button" data-story-remove-item="${escapeHtml(item.id)}" aria-label="移出故事">×</button>
                <div class="story-node-media">
                    <img src="${escapeHtml(photo.thumbSrc || photo.src || '')}" alt="${escapeHtml(photo.name || '故事图片')}" loading="lazy">
                </div>
                <div class="story-node-body">
                    <div class="story-node-toolbar">
                        <span class="story-node-order">第 ${index + 1} 幕</span>
                        <button class="story-node-handle" type="button" data-story-drag-handle="${escapeHtml(item.id)}">拖动重排</button>
                        <div class="story-node-adjustments" role="group" aria-label="节点位置微调">
                            <button class="story-adjust-btn" type="button" data-story-adjust="up" data-story-adjust-item="${escapeHtml(item.id)}">上移</button>
                            <button class="story-adjust-btn" type="button" data-story-adjust="down" data-story-adjust-item="${escapeHtml(item.id)}">下移</button>
                            <button class="story-adjust-btn subtle" type="button" data-story-adjust="reset" data-story-adjust-item="${escapeHtml(item.id)}">归位</button>
                        </div>
                    </div>
                    <div class="story-node-date">${escapeHtml(formatUploadDate(photo.uploadTime) || '未记录日期')}</div>
                    <h4>${escapeHtml(photo.name || '未命名图片')}</h4>
                    <p>${escapeHtml(photo.caption || '这张图片还没有写描述，可以在主相册里继续补充。')}</p>
                    <div class="story-node-foot">
                        <span class="story-node-source">${sourceLabel}</span>
                        ${photo.groupName ? `<span class="story-node-group">${escapeHtml(photo.groupName)}</span>` : ''}
                    </div>
                    ${tags ? `<div class="story-node-tags">${tags}</div>` : ''}
                </div>
            </div>
        </article>
    `;
}

function updateStoryPathPreview(points) {
    const path = buildStoryPath(points);
    dom.storyFlowSurface.querySelector('.story-flow-shadow')?.setAttribute('d', path);
    dom.storyFlowSurface.querySelector('.story-flow-line')?.setAttribute('d', path);
}

function hideDragGuide() {
    const guide = dom.storyFlowSurface?.querySelector('.story-flow-drop-guide');
    if (!guide) return;
    guide.hidden = true;
}

function updateDragGuide(targetIndex) {
    const guide = dom.storyFlowSurface?.querySelector('.story-flow-drop-guide');
    if (!guide) return;
    guide.hidden = false;
    guide.style.left = `${STORY_TIMELINE.padding + (targetIndex * STORY_TIMELINE.step)}px`;
    const label = guide.querySelector('span');
    if (label) label.textContent = `第 ${targetIndex + 1} 张`;
}

function renderStoryTimeline(story) {
    if (!dom.storyFlowSurface || !dom.storyFlowViewport || !dom.storyTimelineMeta) return;

    const items = Array.isArray(story.items) ? story.items : [];
    if (items.length === 0) {
        dom.storyTimelineMeta.textContent = '这个故事还没有图片，可以从主相册卡片或分组卡片加入内容。';
        dom.storyFlowSurface.className = 'story-flow-surface is-empty';
        dom.storyFlowSurface.style.width = '100%';
        dom.storyFlowSurface.innerHTML = `
            <div class="story-flow-empty-card">
                <strong>故事还是空白页</strong>
                <p>去主相册里点“加入故事”，把想讲的图片慢慢接到这条时间流线上。</p>
            </div>
        `;
        return;
    }

    const previousScrollLeft = dom.storyFlowViewport.scrollLeft;
    const viewportWidth = dom.storyFlowViewport.clientWidth || 960;
    const width = getTimelineWidth(items.length, viewportWidth);
    const points = getStoryPoints(items);
    const path = buildStoryPath(points);

    dom.storyTimelineMeta.textContent = buildTimelineMetaText(items.length);
    dom.storyFlowSurface.className = 'story-flow-surface';
    dom.storyFlowSurface.style.width = `${width}px`;
    dom.storyFlowSurface.innerHTML = `
        <svg class="story-flow-svg" viewBox="0 0 ${width} ${STORY_TIMELINE.height}" preserveAspectRatio="none" aria-hidden="true">
            <defs>
                <linearGradient id="storyFlowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="color-mix(in srgb, var(--accent) 34%, white)"></stop>
                    <stop offset="48%" stop-color="var(--accent)"></stop>
                    <stop offset="100%" stop-color="color-mix(in srgb, var(--accent) 48%, #ffd9b8)"></stop>
                </linearGradient>
            </defs>
            <path class="story-flow-shadow" d="${path}"></path>
            <path class="story-flow-line" d="${path}"></path>
        </svg>
        <div class="story-flow-ambient"></div>
        <div class="story-flow-drop-guide" hidden><span></span></div>
        ${items.map((item, index) => buildStoryNode(item, points[index], index)).join('')}
    `;
    dom.storyFlowViewport.scrollLeft = Math.min(previousScrollLeft, Math.max(0, width - dom.storyFlowViewport.clientWidth));
}

function renderStoryView() {
    if (!dom.storyWorkspace) return;

    ensureActiveStory();
    const activeStory = getActiveStory();
    const hasStories = state.stories.length > 0;

    if (dom.storyList) {
        dom.storyList.innerHTML = hasStories
            ? state.stories.map((story) => buildStoryCard(story)).join('')
            : '<div class="story-list-placeholder">还没有故事视图，先创建第一本回忆录吧。</div>';

        dom.storyList.querySelectorAll('[data-story-id]').forEach((button) => {
            button.addEventListener('click', () => {
                state.activeStoryId = button.dataset.storyId || '';
                renderStoryView();
            });
        });
    }

    if (!activeStory) {
        if (dom.storyEmpty) dom.storyEmpty.hidden = false;
        if (dom.storyDetail) dom.storyDetail.hidden = true;
        setEditorStatus('创建故事后会自动保存文案');
        return;
    }

    if (dom.storyEmpty) dom.storyEmpty.hidden = true;
    if (dom.storyDetail) dom.storyDetail.hidden = false;

    if (dom.storyTitle) dom.storyTitle.textContent = activeStory.name;
    if (dom.storyDateMeta) dom.storyDateMeta.textContent = `最近整理于 ${formatUploadDate(activeStory.updatedAt) || '刚刚'}`;
    if (dom.storySummary) {
        const count = activeStory.itemCount || activeStory.items?.length || 0;
        dom.storySummary.textContent = count === 0
            ? '这本故事还没放进图片，先从主相册挑一些关键时刻过来吧。'
            : `现在收进了 ${count} 张图片。每一张都保留原有的描述、标签和分组信息，可以继续在主相册里完善。`;
    }

    if (dom.storyContentInput && dom.storyContentInput.value !== activeStory.content) {
        dom.storyContentInput.value = activeStory.content || '';
    }
    setEditorStatus('故事文案会自动保存');
    renderStoryTimeline(activeStory);
}

function renderSiteView() {
    const isStoryView = state.siteView === 'story';
    document.body.classList.toggle('story-view-active', isStoryView);
    if (dom.albumWorkspace) dom.albumWorkspace.hidden = isStoryView;
    if (dom.storyWorkspace) dom.storyWorkspace.hidden = !isStoryView;
    dom.siteViewBtns.forEach((button) => {
        const active = button.dataset.siteView === state.siteView;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    if (isStoryView) {
        renderStoryView();
    }
}

async function persistStoryContent(storyId, content) {
    try {
        const data = await updateStoryRequest(storyId, { content });
        updateActiveStory(data.story);
        if (state.activeStoryId === storyId) {
            setEditorStatus('已自动保存');
            renderStoryView();
        }
    } catch (error) {
        console.error('保存故事文案失败:', error);
        setEditorStatus('保存失败，请稍后重试');
        showStatusNotice(error.message || '保存故事文案失败', { tone: 'error' });
    }
}

async function persistStoryLayout(nextStory, previousStory) {
    try {
        const data = await updateStoryItemsLayoutRequest(nextStory.id, buildLayoutPayload(nextStory.items));
        updateActiveStory(data.story);
        if (state.activeStoryId === nextStory.id) {
            renderStoryView();
        }
    } catch (error) {
        console.error('保存故事布局失败:', error);
        if (previousStory) {
            updateActiveStory(previousStory);
            renderStoryView();
        }
        showStatusNotice(error.message || '保存故事布局失败，请稍后重试', { tone: 'error' });
    }
}

async function createStoryFlow(name = '') {
    const data = await createStoryRequest(name);
    const nextStory = data.story;
    updateActiveStory({
        ...nextStory,
        itemCount: nextStory.items?.length || 0,
        coverPhoto: null,
        items: []
    });
    state.siteView = 'story';
    renderSiteView();
    renderStoryView();
    showStatusNotice(`已创建故事“${nextStory.name}”`, { tone: 'success' });
    return nextStory;
}

async function chooseStory(targetLabel = '加入故事') {
    if (state.stories.length === 0) {
        const name = window.prompt('还没有故事视图。先创建一个吧，给这次故事起个名字：', '新的图片故事');
        if (name === null) return null;
        return createStoryFlow(name);
    }

    if (state.stories.length === 1) {
        return state.stories[0];
    }

    const answer = window.prompt(`请选择要${targetLabel}到哪个故事。\n${getStoryChoicePrompt()}\n\n输入序号或故事名称：`, state.stories[0]?.name || '');
    if (answer === null) return null;
    const raw = answer.trim();
    if (!raw) return null;

    const byIndex = Number(raw);
    if (Number.isInteger(byIndex) && byIndex >= 1 && byIndex <= state.stories.length) {
        return state.stories[byIndex - 1];
    }

    return state.stories.find((story) => story.name === raw) || null;
}

function buildStoryAfterItemMove(story, itemId, targetIndex, curveOffset) {
    const movingItem = story.items.find((item) => item.id === itemId);
    if (!movingItem) return cloneStory(story);

    const remainingItems = story.items.filter((item) => item.id !== itemId);
    const insertIndex = Math.max(0, Math.min(remainingItems.length, targetIndex));
    remainingItems.splice(insertIndex, 0, {
        ...movingItem,
        curveOffset: roundStoryOffset(curveOffset)
    });
    return withStoryItems(story, remainingItems);
}

function buildStoryAfterItemAdjust(story, itemId, direction) {
    const delta = direction === 'up'
        ? -STORY_TIMELINE.nudgeStep
        : direction === 'down'
            ? STORY_TIMELINE.nudgeStep
            : 0;

    const nextItems = story.items.map((item) => {
        if (item.id !== itemId) return item;
        if (direction === 'reset') {
            return { ...item, curveOffset: 0 };
        }
        return {
            ...item,
            curveOffset: roundStoryOffset((item.curveOffset || 0) + delta)
        };
    });

    return withStoryItems(story, nextItems);
}

function getActiveStoryItem(itemId) {
    const story = getActiveStory();
    if (!story) return { story: null, item: null, index: -1 };
    const index = story.items.findIndex((item) => item.id === itemId);
    return {
        story,
        item: index >= 0 ? story.items[index] : null,
        index
    };
}

async function handleStoryAdjust(itemId, direction) {
    const { story, item, index } = getActiveStoryItem(itemId);
    if (!story || !item || index < 0) return;

    const previousStory = cloneStory(story);
    const nextStory = buildStoryAfterItemAdjust(story, itemId, direction);
    if (!hasLayoutChanged(previousStory, nextStory)) return;

    updateActiveStory(nextStory);
    renderStoryView();
    await persistStoryLayout(nextStory, previousStory);
}

function cleanupNodeDrag() {
    window.removeEventListener('pointermove', handleNodeDragMove);
    window.removeEventListener('pointerup', handleNodeDragEnd);
    window.removeEventListener('pointercancel', handleNodeDragCancel);
    document.body.classList.remove('story-node-dragging');
    dom.storyFlowSurface?.classList.remove('is-editing-layout');
    hideDragGuide();
    nodeDragState = null;
}

function handleNodeDragMove(event) {
    if (!nodeDragState || event.pointerId !== nodeDragState.pointerId) return;
    event.preventDefault();

    const nextX = clampStoryPointX(nodeDragState.startPoint.x + (event.clientX - nodeDragState.startClientX), nodeDragState.itemCount);
    const nextY = clampStoryPointY(nodeDragState.startPoint.y + (event.clientY - nodeDragState.startClientY));
    nodeDragState.previewPoint = { x: nextX, y: nextY };

    const activeNode = dom.storyFlowSurface?.querySelector(`[data-story-item-id="${nodeDragState.itemId}"]`);
    if (activeNode) {
        activeNode.classList.add('dragging');
        activeNode.style.left = `${nextX}px`;
        activeNode.style.top = `${nextY}px`;
    }

    const previewPoints = nodeDragState.basePoints.map((point, index) => (
        index === nodeDragState.itemIndex ? { x: nextX, y: nextY } : point
    ));
    updateStoryPathPreview(previewPoints);

    const targetIndex = getTargetInsertIndex(nextX, nodeDragState.itemCount);
    const curveOffset = getCurveOffsetForPoint(targetIndex, nextY);
    updateDragGuide(targetIndex);
    if (dom.storyTimelineMeta) {
        dom.storyTimelineMeta.textContent = buildDragMetaText(targetIndex, curveOffset);
    }
}

async function finalizeNodeDrag() {
    if (!nodeDragState) return;

    const storySnapshot = nodeDragState.storySnapshot;
    const targetIndex = getTargetInsertIndex(nodeDragState.previewPoint.x, nodeDragState.itemCount);
    const curveOffset = getCurveOffsetForPoint(targetIndex, nodeDragState.previewPoint.y);
    const nextStory = buildStoryAfterItemMove(storySnapshot, nodeDragState.itemId, targetIndex, curveOffset);

    cleanupNodeDrag();

    if (!hasLayoutChanged(storySnapshot, nextStory)) {
        renderStoryView();
        return;
    }

    updateActiveStory(nextStory);
    renderStoryView();
    await persistStoryLayout(nextStory, storySnapshot);
}

function handleNodeDragEnd(event) {
    if (!nodeDragState || event.pointerId !== nodeDragState.pointerId) return;
    finalizeNodeDrag();
}

function handleNodeDragCancel(event) {
    if (!nodeDragState || event.pointerId !== nodeDragState.pointerId) return;
    const storySnapshot = nodeDragState.storySnapshot;
    cleanupNodeDrag();
    if (storySnapshot) {
        updateActiveStory(storySnapshot);
        renderStoryView();
    }
}

function startNodeDrag(event, handle) {
    const itemId = handle.getAttribute('data-story-drag-handle') || '';
    const { story, index } = getActiveStoryItem(itemId);
    if (!story || index < 0) return;

    event.preventDefault();
    event.stopPropagation();

    const points = getStoryPoints(story.items);
    nodeDragState = {
        pointerId: event.pointerId,
        itemId,
        itemIndex: index,
        itemCount: story.items.length,
        storySnapshot: cloneStory(story),
        basePoints: points,
        startPoint: points[index],
        previewPoint: points[index],
        startClientX: event.clientX,
        startClientY: event.clientY
    };

    document.body.classList.add('story-node-dragging');
    dom.storyFlowSurface?.classList.add('is-editing-layout');
    window.addEventListener('pointermove', handleNodeDragMove, { passive: false });
    window.addEventListener('pointerup', handleNodeDragEnd);
    window.addEventListener('pointercancel', handleNodeDragCancel);
}

async function handleCreateStory() {
    const name = window.prompt('给新故事起个名字吧', '新的图片故事');
    if (name === null) return;

    try {
        const story = await createStoryFlow(name);
        state.activeStoryId = story.id;
        renderStoryView();
    } catch (error) {
        console.error('创建故事失败:', error);
        showStatusNotice(error.message || '创建故事失败，请稍后重试', { tone: 'error' });
    }
}

async function handleRenameStory() {
    const story = getActiveStory();
    if (!story) return;

    const name = window.prompt('重命名当前故事', story.name);
    if (name === null) return;
    const nextName = name.trim();
    if (!nextName || nextName === story.name) return;

    try {
        const data = await updateStoryRequest(story.id, { name: nextName });
        updateActiveStory(data.story);
        renderStoryView();
        showStatusNotice('故事名称已更新', { tone: 'success' });
    } catch (error) {
        console.error('重命名故事失败:', error);
        showStatusNotice(error.message || '重命名故事失败，请稍后重试', { tone: 'error' });
    }
}

async function handleDeleteStory() {
    const story = getActiveStory();
    if (!story) return;
    const confirmed = window.confirm(`确定删除故事“${story.name}”吗？故事文案和时间流线条目会一起移除。`);
    if (!confirmed) return;

    try {
        await deleteStoryRequest(story.id);
        removeStoryFromStore(story.id);
        renderStoryView();
        showStatusNotice('故事已删除', { tone: 'success' });
    } catch (error) {
        console.error('删除故事失败:', error);
        showStatusNotice(error.message || '删除故事失败，请稍后重试', { tone: 'error' });
    }
}

function bindViewportDragging() {
    if (!dom.storyFlowViewport) return;

    dom.storyFlowViewport.addEventListener('pointerdown', (event) => {
        const interactive = event.target.closest('button, textarea, input');
        if (interactive || nodeDragState) return;
        viewportDragState = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startScrollLeft: dom.storyFlowViewport.scrollLeft
        };
        dom.storyFlowViewport.classList.add('dragging');
        dom.storyFlowViewport.setPointerCapture(event.pointerId);
    });

    dom.storyFlowViewport.addEventListener('pointermove', (event) => {
        if (!viewportDragState || viewportDragState.pointerId !== event.pointerId) return;
        const deltaX = event.clientX - viewportDragState.startX;
        dom.storyFlowViewport.scrollLeft = viewportDragState.startScrollLeft - deltaX;
    });

    const finishDrag = (event) => {
        if (!viewportDragState || viewportDragState.pointerId !== event.pointerId) return;
        dom.storyFlowViewport.classList.remove('dragging');
        if (dom.storyFlowViewport.hasPointerCapture(event.pointerId)) {
            dom.storyFlowViewport.releasePointerCapture(event.pointerId);
        }
        viewportDragState = null;
    };

    dom.storyFlowViewport.addEventListener('pointerup', finishDrag);
    dom.storyFlowViewport.addEventListener('pointercancel', finishDrag);
    dom.storyFlowViewport.addEventListener('lostpointercapture', () => {
        dom.storyFlowViewport.classList.remove('dragging');
        viewportDragState = null;
    });
}

async function addItemsToStory(photoIds, options = {}) {
    const story = await chooseStory(options.targetLabel || '加入故事');
    if (!story) {
        if (state.stories.length > 0) {
            showStatusNotice('没有找到对应的故事，请重试一次。', { tone: 'info', duration: 2200 });
        }
        return;
    }

    const data = await addStoryItemsRequest(story.id, {
        photoIds,
        sourceType: options.sourceType || 'photo',
        sourceGroupName: options.sourceGroupName || ''
    });

    updateActiveStory(data.story);
    renderStoryView();

    const baseMessage = data.addedCount > 0
        ? `已加入 ${data.addedCount} 张到“${data.story.name}”`
        : `这些图片已经在“${data.story.name}”里了`;
    const skippedMessage = data.skippedCount > 0 ? `，跳过 ${data.skippedCount} 张重复内容` : '';

    showStatusNotice(`${baseMessage}${skippedMessage}`, {
        tone: 'success',
        actionLabel: '打开故事模式',
        onAction: () => {
            state.siteView = 'story';
            state.activeStoryId = data.story.id;
            renderSiteView();
        }
    });
}

export async function promptAddPhotoToStory(photoId) {
    const normalizedId = String(photoId || '').trim();
    if (!normalizedId) return;

    try {
        await addItemsToStory([normalizedId], { targetLabel: '加入故事', sourceType: 'photo' });
    } catch (error) {
        console.error('加入故事失败:', error);
        showStatusNotice(error.message || '加入故事失败，请稍后重试', { tone: 'error' });
    }
}

export async function promptAddGroupToStory(groupName) {
    const normalizedGroupName = String(groupName || '').trim();
    if (!normalizedGroupName) return;
    const photoIds = state.photos
        .filter((photo) => String(photo.groupName || '').trim() === normalizedGroupName)
        .map((photo) => photo.id);

    if (photoIds.length === 0) {
        showStatusNotice('这个分组里暂时没有可加入故事的图片。', { tone: 'info', duration: 2200 });
        return;
    }

    try {
        await addItemsToStory(photoIds, {
            targetLabel: '加入故事',
            sourceType: 'group',
            sourceGroupName: normalizedGroupName
        });
    } catch (error) {
        console.error('分组加入故事失败:', error);
        showStatusNotice(error.message || '分组加入故事失败，请稍后重试', { tone: 'error' });
    }
}

export async function loadStories() {
    try {
        const data = await fetchStories();
        setStories(data.stories || []);
        ensureActiveStory();
        renderSiteView();
    } catch (error) {
        console.error('加载故事失败:', error);
        showStatusNotice(error.message || '加载故事失败，请稍后重试', { tone: 'error' });
    }
}

export function initStory() {
    dom.siteViewBtns.forEach((button) => {
        button.addEventListener('click', () => {
            state.siteView = button.dataset.siteView === 'story' ? 'story' : 'album';
            renderSiteView();
        });
    });

    dom.storyCreateBtn?.addEventListener('click', handleCreateStory);
    dom.storyCreateEmptyBtn?.addEventListener('click', handleCreateStory);
    dom.storyRenameBtn?.addEventListener('click', handleRenameStory);
    dom.storyDeleteBtn?.addEventListener('click', handleDeleteStory);

    dom.storyTimelinePrevBtn?.addEventListener('click', () => {
        dom.storyFlowViewport?.scrollBy({ left: -(dom.storyFlowViewport.clientWidth * 0.78), behavior: 'smooth' });
    });

    dom.storyTimelineNextBtn?.addEventListener('click', () => {
        dom.storyFlowViewport?.scrollBy({ left: dom.storyFlowViewport.clientWidth * 0.78, behavior: 'smooth' });
    });

    dom.storyContentInput?.addEventListener('input', () => {
        const story = getActiveStory();
        if (!story) return;

        const content = dom.storyContentInput.value;
        updateActiveStory({ ...story, content });
        setEditorStatus('保存中...');
        if (autosaveTimer) clearTimeout(autosaveTimer);
        autosaveTimer = window.setTimeout(() => {
            persistStoryContent(story.id, content);
        }, 650);
    });

    dom.storyFlowSurface?.addEventListener('click', async (event) => {
        const removeBtn = event.target.closest('[data-story-remove-item]');
        if (removeBtn) {
            const story = getActiveStory();
            const itemId = removeBtn.getAttribute('data-story-remove-item') || '';
            if (!story || !itemId) return;

            try {
                const data = await deleteStoryItemRequest(story.id, itemId);
                updateActiveStory(data.story);
                renderStoryView();
                showStatusNotice('这张图片已从当前故事移出', { tone: 'success', duration: 2200 });
            } catch (error) {
                console.error('移出故事失败:', error);
                showStatusNotice(error.message || '移出故事失败，请稍后重试', { tone: 'error' });
            }
            return;
        }

        const adjustBtn = event.target.closest('[data-story-adjust-item]');
        if (adjustBtn) {
            const itemId = adjustBtn.getAttribute('data-story-adjust-item') || '';
            const direction = adjustBtn.getAttribute('data-story-adjust') || '';
            if (!itemId || !direction) return;
            await handleStoryAdjust(itemId, direction);
        }
    });

    dom.storyFlowSurface?.addEventListener('pointerdown', (event) => {
        const handle = event.target.closest('[data-story-drag-handle]');
        if (!handle) return;
        startNodeDrag(event, handle);
    });

    bindViewportDragging();
    window.addEventListener('resize', () => {
        if (state.siteView === 'story') {
            renderStoryView();
        }
    });
    renderSiteView();
}
