/**
 * Valorant 高光管理器 - V3 共享应用逻辑
 * 新增：设置功能、文件夹管理、枪械选择器
 */

// ==================== 应用状态 ====================
const appState = {
    // 全局配置（从 app_config.json 加载）
    config: {
        presetTags: ['三杀', '四杀', '五杀', '残局', '一血'],
        importedFolders: []
    },

    importedFolders: [],      // 导入的文件夹路径列表
    currentFolder: null,      // 当前筛选的文件夹（null 表示全部）
    allVideos: [],            // 视频对象数组
    currentVideo: null,       // 当前编辑的视频
    currentVideoIndex: -1,    // 当前视频在列表中的索引
    searchQuery: '',          // 搜索关键词
    selectedFilterTags: [],   // 筛选标签
    sortOrder: 'time-desc',   // 排序方式

    // 编辑器状态
    editingTags: [],          // 当前编辑的标签
    editingAgent: null,       // 当前选择的特工
    editingWeapon: null,      // 当前选择的枪械
    editingStartTime: 0,      // 片段开始时间
    editingEndTime: 0,        // 片段结束时间
    videoDuration: 0,         // 视频总时长
    customTags: [],           // 当前会话的自定义标签

    // 播放器状态
    playbackSpeed: 1.0,
    volume: 1.0,
    isMuted: false,

    // UI 状态
    isSettingsOpen: false,
    contextMenuFolder: null,

    // 编辑器：未保存的视频修改记录
    pendingChanges: {},  // { videoPath: { tags, agent, weapon, start_time, end_time } }
    hasUnsavedChanges: false,  // 是否有未保存的改动

    // 编辑器：初始状态（用于脏数据检测）
    initialState: null,  // { tags, agent, weapon, start_time, end_time }

    // 快速标记模式：全局新视频列表
    quickTagMode: false,
    quickTagVideos: []  // 所有新视频的虚拟播放列表
};

// 特工列表（按类型分组）
const AGENTS = {
    '先锋': ['钛狐', '铁臂', '猎枭', '斯凯', 'K/O', '黑梦', '盖可'],
    '决斗': ['捷风', '雷兹', '不死鸟', '芮娜', '夜露', '霓虹', '壹决', '幻棱'],
    '控场': ['幽影', '炼狱', '蝰蛇', '星礈', '海神', '暮蝶'],
    '哨卫': ['贤者', '零', '奇乐', '尚勃勒', '钢锁', '维斯', '禁灭']
};

// 枪械列表（按类型分组）
const WEAPONS = {
    '手枪': ['标配', '短炮', '狂怒', '鬼魅', '追猎', '正义'],
    '冲锋枪': ['蜂刺', '骇灵'],
    '霰弹枪': ['雄鹿', '判官'],
    '步枪': ['獠犬', '戍卫', '幻影', '狂徒'],
    '狙击枪': ['飞将', '莽侠', '冥驹'],
    '机枪': ['战神', '奥丁']
};

// 缩略图缓存
const thumbnailCache = {};

// ==================== 工具函数 ====================

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTimeMs(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00.00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(1) + ' KB';
    }
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    if (days < 30) return `${Math.floor(days / 7)}周前`;
    return `${Math.floor(days / 30)}月前`;
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-item flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl backdrop-blur-sm border transition-all transform translate-x-full ${type === 'success'
        ? 'bg-green-500/90 border-green-400 text-white'
        : type === 'error'
            ? 'bg-red-500/90 border-red-400 text-white'
            : 'bg-surface-dark/90 border-white/10 text-white'
        }`;

    const icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info';
    toast.innerHTML = `
        <span class="material-symbols-outlined">${icon}</span>
        <span class="text-sm font-medium">${message}</span>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full');
        toast.classList.add('translate-x-0');
    });

    setTimeout(() => {
        toast.classList.remove('translate-x-0');
        toast.classList.add('translate-x-full');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==================== 配置管理 ====================

async function loadGlobalConfig() {
    try {
        const config = await window.configAPI.loadConfig();
        appState.config = config;
        appState.importedFolders = config.importedFolders || [];
    } catch (e) {
        console.error('加载配置失败:', e);
    }
}

async function saveGlobalConfig() {
    appState.config.importedFolders = appState.importedFolders;
    try {
        await window.configAPI.saveConfig(appState.config);
    } catch (e) {
        console.error('保存配置失败:', e);
    }
}

// ==================== 缩略图和时长 ====================

function getVideoMetadata(videoPath) {
    return new Promise((resolve) => {
        if (thumbnailCache[videoPath]) {
            resolve(thumbnailCache[videoPath]);
            return;
        }

        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;

        video.onloadedmetadata = () => {
            video.currentTime = Math.min(1, video.duration * 0.1);
        };

        video.onseeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = 180;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const result = {
                duration: video.duration,
                thumbnail: canvas.toDataURL('image/jpeg', 0.7)
            };

            thumbnailCache[videoPath] = result;
            video.src = '';
            video.remove();
            resolve(result);
        };

        video.onerror = () => {
            resolve({ duration: 0, thumbnail: null });
        };

        setTimeout(() => {
            if (!thumbnailCache[videoPath]) {
                resolve({ duration: 0, thumbnail: null });
            }
        }, 3000);

        video.src = `file://${videoPath}`;
    });
}

// ==================== 数据加载 ====================

async function loadAllVideos() {
    appState.allVideos = [];

    for (const folderPath of appState.importedFolders) {
        try {
            await loadFolderVideos(folderPath);
        } catch (e) {
            console.error('加载文件夹失败:', folderPath, e);
        }
    }

    sortVideos();
    loadVideoMetadataAsync();
}

async function loadVideoMetadataAsync() {
    for (const video of appState.allVideos) {
        if (!video.duration || !video.thumbnail) {
            const metadata = await getVideoMetadata(video.path);
            video.duration = metadata.duration;
            video.thumbnail = metadata.thumbnail;
            renderVideoGrid();
        }
    }
}

async function loadFolderVideos(folderPath) {
    const videoFiles = await window.highlightAPI.scanFolder(folderPath);
    const meta = await window.highlightAPI.loadMeta(folderPath);

    let metaUpdated = false;
    for (const video of videoFiles) {
        if (!meta.videos[video.filename]) {
            meta.videos[video.filename] = {
                is_new: true,
                tags: [],
                agent: null,
                weapon: null,
                start_time: 0,
                end_time: 0
            };
            metaUpdated = true;
        }
    }

    if (metaUpdated) {
        await window.highlightAPI.saveMeta(folderPath, meta);
    }

    for (const video of videoFiles) {
        appState.allVideos.push({
            ...video,
            meta: meta.videos[video.filename] || {
                is_new: true,
                tags: [],
                agent: null,
                weapon: null,
                start_time: 0,
                end_time: 0
            },
            duration: 0,
            thumbnail: null
        });
    }
}

function sortVideos() {
    switch (appState.sortOrder) {
        case 'time-desc':
            appState.allVideos.sort((a, b) => b.mtime - a.mtime);
            break;
        case 'time-asc':
            appState.allVideos.sort((a, b) => a.mtime - b.mtime);
            break;
        case 'name-asc':
            appState.allVideos.sort((a, b) => a.filename.localeCompare(b.filename));
            break;
        case 'name-desc':
            appState.allVideos.sort((a, b) => b.filename.localeCompare(a.filename));
            break;
    }
}

function getFilteredVideos() {
    let videos = appState.allVideos;

    // 按文件夹筛选
    if (appState.currentFolder) {
        videos = videos.filter(v => v.folder === appState.currentFolder);
    }

    // 按搜索关键词筛选
    if (appState.searchQuery) {
        const query = appState.searchQuery.toLowerCase();
        videos = videos.filter(v =>
            v.filename.toLowerCase().includes(query) ||
            (v.meta.tags && v.meta.tags.some(tag => tag.toLowerCase().includes(query))) ||
            (v.meta.agent && v.meta.agent.toLowerCase().includes(query)) ||
            (v.meta.weapon && v.meta.weapon.toLowerCase().includes(query))
        );
    }

    // 按标签筛选（AND 逻辑）
    if (appState.selectedFilterTags.length > 0) {
        videos = videos.filter(v =>
            v.meta.tags && appState.selectedFilterTags.every(tag => v.meta.tags.includes(tag))
        );
    }

    return videos;
}

function getAllUniqueTags() {
    const tagsSet = new Set();
    for (const video of appState.allVideos) {
        if (video.meta.tags) {
            video.meta.tags.forEach(tag => tagsSet.add(tag));
        }
        if (video.meta.agent) tagsSet.add(video.meta.agent);
        if (video.meta.weapon) tagsSet.add(video.meta.weapon);
    }
    return Array.from(tagsSet);
}

// ==================== Dashboard 渲染 ====================

function renderVideoGrid() {
    const grid = document.getElementById('video-grid');
    if (!grid) return;

    const videos = getFilteredVideos();
    const countEl = document.getElementById('video-count');
    if (countEl) countEl.textContent = videos.length;

    // 更新动态标题
    updateDashboardTitle();

    if (videos.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-20 text-white/40">
                <span class="material-symbols-outlined text-6xl mb-4">video_library</span>
                <p class="text-lg font-medium mb-2">暂无视频</p>
                <p class="text-sm">${appState.currentFolder ? '该文件夹中没有视频' : '点击左下角 "导入新文件夹" 开始使用'}</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = videos.map((video) => {
        const globalIndex = appState.allVideos.indexOf(video);
        const displayDuration = video.duration || video.meta.end_time || 0;

        return `
        <div class="group flex flex-col gap-3 cursor-pointer" onclick="openEditor(${globalIndex})">
            <div class="relative w-full aspect-video rounded-lg overflow-hidden border border-white/5 group-hover:border-primary/50 transition-colors shadow-lg shadow-black/40">
                ${video.thumbnail
                ? `<img src="${video.thumbnail}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt="">`
                : `<div class="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center transition-transform duration-500 group-hover:scale-105">
                        <span class="material-symbols-outlined text-gray-600 text-4xl">movie</span>
                    </div>`
            }
                ${video.meta.is_new ? `<div class="absolute top-2 left-2 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">新</div>` : ''}
                <div class="absolute bottom-2 right-2 bg-black/80 backdrop-blur-sm text-white text-xs font-mono font-medium px-1.5 py-0.5 rounded">${formatTime(displayDuration)}</div>
                <div class="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div class="bg-primary/90 rounded-full p-3 shadow-xl backdrop-blur-sm transform scale-75 group-hover:scale-100 transition-transform">
                        <span class="material-symbols-outlined text-white text-2xl">play_arrow</span>
                    </div>
                </div>
            </div>
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="text-white text-sm font-medium leading-snug group-hover:text-primary transition-colors">${video.filename}</h3>
                    <p class="text-white/40 text-xs mt-1">${formatRelativeTime(video.mtime)}${video.meta.tags && video.meta.tags.length > 0 ? ' • ' + video.meta.tags.slice(0, 2).join(', ') : ''}</p>
                </div>
                <button class="text-white/20 hover:text-white transition-colors" onclick="event.stopPropagation()">
                    <span class="material-symbols-outlined text-[18px]">more_vert</span>
                </button>
            </div>
        </div>
    `}).join('');
}

function renderFolderList() {
    const list = document.getElementById('folder-list');
    if (!list) return;

    list.innerHTML = appState.importedFolders.map((folder) => {
        const folderName = folder.split(/[/\\]/).pop();
        const videoCount = appState.allVideos.filter(v => v.folder === folder).length;
        const newCount = appState.allVideos.filter(v => v.folder === folder && v.meta.is_new).length;
        const isActive = appState.currentFolder === folder;

        return `
            <div class="flex items-center gap-3 px-3 py-2.5 rounded-lg ${isActive ? 'bg-primary/20 border border-primary/30' : 'hover:bg-surface-hover'} transition-colors group cursor-pointer"
                 onclick="filterByFolder('${folder.replace(/\\/g, '\\\\')}')"
                 oncontextmenu="showFolderContextMenu(event, '${folder.replace(/\\/g, '\\\\')}')">
                <span class="material-symbols-outlined ${isActive ? 'text-primary' : 'text-white/70 group-hover:text-white'} transition-colors" style="font-size: 20px;">${isActive ? 'folder_open' : 'folder'}</span>
                <p class="${isActive ? 'text-primary' : 'text-white/70 group-hover:text-white'} text-sm font-medium transition-colors flex-1 truncate">${folderName}</p>
                <div class="flex items-center gap-1.5">
                    ${newCount > 0 ? `<span class="bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded">${newCount}</span>` : ''}
                    <span class="text-white/40 text-xs">${videoCount}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderTagFilterList() {
    const list = document.getElementById('tag-filter-list');
    if (!list) return;

    const allTags = getAllUniqueTags();

    if (allTags.length === 0) {
        list.innerHTML = '<p class="text-white/40 text-xs">暂无标签</p>';
    } else {
        list.innerHTML = allTags.map(tag => {
            const isSelected = appState.selectedFilterTags.includes(tag);
            return `
                <button class="px-2.5 py-1 text-xs rounded ${isSelected
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'bg-surface-hover text-white/80 border border-white/10'
                } hover:bg-primary hover:text-white transition-colors" onclick="toggleFilterTag('${tag}')">
                    ${tag}
                </button>
            `;
        }).join('');
    }

    const countEl = document.getElementById('filter-count');
    if (countEl) countEl.textContent = `已选: ${appState.selectedFilterTags.length}`;
}

function updateSortButtonsUI() {
    const timeBtn = document.getElementById('sort-by-time');
    const nameBtn = document.getElementById('sort-by-name');

    if (timeBtn && nameBtn) {
        const isTimeSort = appState.sortOrder.startsWith('time');

        if (isTimeSort) {
            timeBtn.className = 'flex items-center justify-between w-full px-3 py-2 text-sm text-primary bg-primary/10 rounded-lg mb-1 transition-colors';
            timeBtn.innerHTML = '<span class="font-medium">按时间排序</span><span class="material-symbols-outlined text-[18px]">check</span>';
            nameBtn.className = 'flex items-center justify-between w-full px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors';
            nameBtn.innerHTML = '<span>按文件名排序</span>';
        } else {
            nameBtn.className = 'flex items-center justify-between w-full px-3 py-2 text-sm text-primary bg-primary/10 rounded-lg mb-1 transition-colors';
            nameBtn.innerHTML = '<span class="font-medium">按文件名排序</span><span class="material-symbols-outlined text-[18px]">check</span>';
            timeBtn.className = 'flex items-center justify-between w-full px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors';
            timeBtn.innerHTML = '<span>按时间排序</span>';
        }
    }

    const ascBtn = document.getElementById('sort-asc');
    const descBtn = document.getElementById('sort-desc');

    if (ascBtn && descBtn) {
        const isDesc = appState.sortOrder.endsWith('desc');

        if (isDesc) {
            descBtn.className = 'flex-1 text-xs font-medium py-1.5 rounded text-center bg-surface-hover text-white shadow-sm border border-white/5';
            ascBtn.className = 'flex-1 text-xs font-medium py-1.5 rounded text-center text-white/50 hover:text-white hover:bg-white/5 transition-colors';
        } else {
            ascBtn.className = 'flex-1 text-xs font-medium py-1.5 rounded text-center bg-surface-hover text-white shadow-sm border border-white/5';
            descBtn.className = 'flex-1 text-xs font-medium py-1.5 rounded text-center text-white/50 hover:text-white hover:bg-white/5 transition-colors';
        }
    }
}

// ==================== Dashboard 交互 ====================

function quickTag() {
    // 聚合所有文件夹的新视频
    const allNewVideos = appState.allVideos.filter(v => v.meta.is_new === true);

    if (allNewVideos.length > 0) {
        // 设置快速标记模式
        appState.quickTagMode = true;
        appState.quickTagVideos = allNewVideos;

        // 存储到 sessionStorage
        sessionStorage.setItem('quickTagMode', 'true');
        sessionStorage.setItem('quickTagVideos', JSON.stringify(allNewVideos.map(v => v.path)));

        // 打开第一个新视频
        openEditor(appState.allVideos.indexOf(allNewVideos[0]));
    } else {
        showToast('没有待标记的新视频', 'info');
    }
}

async function importFolder() {
    const folderPath = await window.highlightAPI.selectFolder();
    if (!folderPath) return;

    if (appState.importedFolders.includes(folderPath)) {
        showToast('该文件夹已导入', 'info');
        return;
    }

    appState.importedFolders.push(folderPath);
    await saveGlobalConfig();

    await loadFolderVideos(folderPath);
    sortVideos();

    renderFolderList();
    renderVideoGrid();
    renderTagFilterList();
    loadVideoMetadataAsync();

    showToast('文件夹导入成功！', 'success');
}

function filterByFolder(folderPath) {
    if (appState.currentFolder === folderPath) {
        // 再次点击取消筛选
        appState.currentFolder = null;
    } else {
        appState.currentFolder = folderPath;
    }
    renderFolderList();
    renderVideoGrid();
}

function showAllVideos() {
    appState.currentFolder = null;
    renderFolderList();
    renderVideoGrid();
}

/**
 * 更新 Dashboard 标题（动态显示当前文件夹）
 */
function updateDashboardTitle() {
    const titleEl = document.getElementById('grid-title');
    if (!titleEl) return;

    if (appState.currentFolder) {
        const folderName = appState.currentFolder.split(/[/\\]/).pop();
        titleEl.textContent = folderName;
    } else {
        titleEl.textContent = '全部视频';
    }
}

// 右键菜单
function showFolderContextMenu(event, folderPath) {
    event.preventDefault();
    event.stopPropagation();

    // 移除已有的菜单
    const existing = document.getElementById('folder-context-menu');
    if (existing) existing.remove();

    appState.contextMenuFolder = folderPath;

    const menu = document.createElement('div');
    menu.id = 'folder-context-menu';
    menu.className = 'fixed bg-surface-dark border border-white/10 rounded-lg shadow-2xl py-1 z-50';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;

    menu.innerHTML = `
        <button onclick="removeFolder()" class="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
            <span class="material-symbols-outlined text-base">folder_off</span>
            移除文件夹
        </button>
    `;

    document.body.appendChild(menu);

    // 点击其他位置关闭菜单
    const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

async function removeFolder() {
    const folderPath = appState.contextMenuFolder;
    if (!folderPath) return;

    // 从列表中移除（软删除，不删除 .highlight_meta.json）
    const index = appState.importedFolders.indexOf(folderPath);
    if (index > -1) {
        appState.importedFolders.splice(index, 1);
    }

    // 从视频列表中移除该文件夹的视频
    appState.allVideos = appState.allVideos.filter(v => v.folder !== folderPath);

    // 如果当前筛选的是这个文件夹，取消筛选
    if (appState.currentFolder === folderPath) {
        appState.currentFolder = null;
    }

    await saveGlobalConfig();

    renderFolderList();
    renderVideoGrid();
    renderTagFilterList();

    // 关闭菜单
    const menu = document.getElementById('folder-context-menu');
    if (menu) menu.remove();

    showToast('文件夹已移除', 'success');
}

function toggleFilterTag(tag) {
    const index = appState.selectedFilterTags.indexOf(tag);
    if (index > -1) {
        appState.selectedFilterTags.splice(index, 1);
    } else {
        appState.selectedFilterTags.push(tag);
    }
    renderTagFilterList();
    renderVideoGrid();
}

function clearFilters() {
    appState.selectedFilterTags = [];
    appState.searchQuery = '';
    appState.currentFolder = null;
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    renderFolderList();
    renderTagFilterList();
    renderVideoGrid();
}

function handleSearch(event) {
    appState.searchQuery = event.target.value;
    renderVideoGrid();
}

function setSortType(type) {
    const isDesc = appState.sortOrder.endsWith('desc');
    appState.sortOrder = `${type}-${isDesc ? 'desc' : 'asc'}`;
    sortVideos();
    renderVideoGrid();
    updateSortButtonsUI();
}

function setSortDirection(direction) {
    const type = appState.sortOrder.startsWith('time') ? 'time' : 'name';
    appState.sortOrder = `${type}-${direction}`;
    sortVideos();
    renderVideoGrid();
    updateSortButtonsUI();
}

function openEditor(videoIndex) {
    appState.currentVideoIndex = videoIndex;
    appState.currentVideo = appState.allVideos[videoIndex];

    sessionStorage.setItem('currentVideo', JSON.stringify({
        index: videoIndex,
        video: appState.currentVideo
    }));
    sessionStorage.setItem('allVideos', JSON.stringify(appState.allVideos));
    sessionStorage.setItem('presetTags', JSON.stringify(appState.config.presetTags));

    window.location.href = 'code2.html';
}

// ==================== 设置面板 ====================

function openSettings() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.classList.remove('hidden');
        appState.isSettingsOpen = true;
        renderPresetTagsList();
    }
}

function closeSettings() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.classList.add('hidden');
        appState.isSettingsOpen = false;
    }
}

function renderPresetTagsList() {
    const list = document.getElementById('preset-tags-list');
    if (!list) return;

    list.innerHTML = appState.config.presetTags.map((tag, index) => `
        <div class="flex items-center justify-between bg-surface-lighter rounded px-3 py-2">
            <span class="text-sm text-white">${tag}</span>
            <button onclick="removePresetTag(${index})" class="text-red-400 hover:text-red-300 transition-colors">
                <span class="material-symbols-outlined text-base">close</span>
            </button>
        </div>
    `).join('');
}

async function addPresetTag() {
    const input = document.getElementById('new-preset-tag-input');
    if (!input) return;

    const tag = input.value.trim();
    if (!tag) return;

    if (appState.config.presetTags.includes(tag)) {
        showToast('该标签已存在', 'info');
        return;
    }

    appState.config.presetTags.push(tag);
    await saveGlobalConfig();

    input.value = '';
    renderPresetTagsList();
    showToast('标签已添加', 'success');
}

async function removePresetTag(index) {
    appState.config.presetTags.splice(index, 1);
    await saveGlobalConfig();
    renderPresetTagsList();
    showToast('标签已删除', 'success');
}

// ==================== Editor 逻辑 ====================

function initEditor() {
    const currentVideoData = sessionStorage.getItem('currentVideo');
    const allVideosData = sessionStorage.getItem('allVideos');
    const presetTagsData = sessionStorage.getItem('presetTags');

    if (!currentVideoData || !allVideosData) {
        window.location.href = 'code.html';
        return;
    }

    const { index, video } = JSON.parse(currentVideoData);
    appState.allVideos = JSON.parse(allVideosData);
    appState.currentVideoIndex = index;
    appState.currentVideo = video;

    if (presetTagsData) {
        appState.config.presetTags = JSON.parse(presetTagsData);
    }

    // 检查快速标记模式
    const quickTagMode = sessionStorage.getItem('quickTagMode');
    const quickTagVideosData = sessionStorage.getItem('quickTagVideos');
    if (quickTagMode === 'true' && quickTagVideosData) {
        appState.quickTagMode = true;
        const videoPaths = JSON.parse(quickTagVideosData);
        appState.quickTagVideos = appState.allVideos.filter(v => videoPaths.includes(v.path));
    }

    // 初始化编辑状态
    appState.editingTags = [...(video.meta.tags || [])];
    appState.editingAgent = video.meta.agent || null;
    appState.editingWeapon = video.meta.weapon || null;
    appState.editingStartTime = video.meta.start_time || 0;
    appState.editingEndTime = video.meta.end_time || 0;
    appState.customTags = [];

    // 存储初始状态（用于脏数据检测）
    appState.initialState = {
        tags: [...(video.meta.tags || [])],
        agent: video.meta.agent || null,
        weapon: video.meta.weapon || null,
        start_time: video.meta.start_time || 0,
        end_time: video.meta.end_time || 0
    };

    renderEditorUI();
    setupVideoPlayer();
    renderFileList();
    initTimeline();
    initPlayerControls();
}

function renderEditorUI() {
    const titleEl = document.querySelector('header p');
    if (titleEl) {
        titleEl.textContent = `编辑器 - ${appState.currentVideo.filename}`;
    }

    // 渲染动态预设标签
    renderDynamicPresetTags();

    updateAgentButtons();
    updateWeaponButtons();
    updateTagButtons();
    renderCustomTagButtons();
}

function renderDynamicPresetTags() {
    const container = document.getElementById('preset-tags-container');
    if (!container) return;

    container.innerHTML = appState.config.presetTags.map(tag => {
        const isActive = appState.editingTags.includes(tag);
        return `
            <button class="tag-btn flex items-center justify-center h-10 ${isActive
                ? 'bg-primary text-white border border-primary shadow-[0_0_10px_rgba(255,71,87,0.3)]'
                : 'bg-surface-lighter hover:bg-border-dark hover:text-primary border border-transparent hover:border-primary/50'
            } rounded transition-all" data-tag="${tag}" onclick="toggleTag('${tag}')">
                <span class="text-sm ${isActive ? 'font-bold' : 'font-medium'}">${tag}</span>
            </button>
        `;
    }).join('');
}

function setupVideoPlayer() {
    const videoPlayer = document.getElementById('video-player');
    if (!videoPlayer) return;

    videoPlayer.src = `file://${appState.currentVideo.path}`;
    videoPlayer.volume = appState.volume;
    videoPlayer.playbackRate = appState.playbackSpeed;

    videoPlayer.onloadedmetadata = () => {
        appState.videoDuration = videoPlayer.duration;
        if (appState.editingEndTime === 0) {
            appState.editingEndTime = videoPlayer.duration;
        }
        updateTimelineDisplay();
        updateTimeDisplay();
    };

    videoPlayer.ontimeupdate = () => {
        updatePlayhead();
        updateCurrentTimeDisplay();

        if (videoPlayer.currentTime >= appState.editingEndTime) {
            videoPlayer.currentTime = appState.editingStartTime;
        }
    };

    videoPlayer.onplay = () => updatePlayButton();
    videoPlayer.onpause = () => updatePlayButton();
}

function updateCurrentTimeDisplay() {
    const videoPlayer = document.getElementById('video-player');
    if (!videoPlayer) return;

    const currentTime = videoPlayer.currentTime;
    const duration = appState.videoDuration;

    const headerTimeEl = document.getElementById('header-current-time');
    const headerDurationEl = document.getElementById('header-duration');
    if (headerTimeEl) headerTimeEl.textContent = formatTime(currentTime);
    if (headerDurationEl) headerDurationEl.textContent = formatTime(duration);

    const currentTimeEl = document.getElementById('current-time-display');
    const durationEl = document.getElementById('duration-display');
    if (currentTimeEl) currentTimeEl.textContent = formatTime(currentTime);
    if (durationEl) durationEl.textContent = formatTime(duration);
}

function updateTagButtons() {
    document.querySelectorAll('.tag-btn').forEach(btn => {
        const tag = btn.dataset.tag;
        const isActive = appState.editingTags.includes(tag);

        if (isActive) {
            btn.className = 'tag-btn flex items-center justify-center h-10 bg-primary text-white border border-primary shadow-[0_0_10px_rgba(255,71,87,0.3)] rounded transition-all';
            const span = btn.querySelector('span');
            if (span) span.className = 'text-sm font-bold';
        } else {
            btn.className = 'tag-btn flex items-center justify-center h-10 bg-surface-lighter hover:bg-border-dark hover:text-primary border border-transparent hover:border-primary/50 rounded transition-all group';
            const span = btn.querySelector('span');
            if (span) span.className = 'text-sm font-medium';
        }
    });
}

function renderCustomTagButtons() {
    const container = document.getElementById('custom-tags-container');
    if (!container) return;

    const customTags = appState.editingTags.filter(tag =>
        !appState.config.presetTags.includes(tag) &&
        !Object.values(AGENTS).flat().includes(tag) &&
        !Object.values(WEAPONS).flat().includes(tag)
    );

    appState.customTags.forEach(tag => {
        if (!customTags.includes(tag)) customTags.push(tag);
    });

    if (customTags.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = customTags.map(tag => {
        const isActive = appState.editingTags.includes(tag);
        return `
            <button class="tag-btn flex items-center justify-center h-10 ${isActive
                ? 'bg-primary text-white border border-primary shadow-[0_0_10px_rgba(255,71,87,0.3)]'
                : 'bg-surface-lighter hover:bg-border-dark hover:text-primary border border-transparent hover:border-primary/50'
            } rounded transition-all" data-tag="${tag}" onclick="toggleTag('${tag}')">
                <span class="text-sm ${isActive ? 'font-bold' : 'font-medium'}">${tag}</span>
            </button>
        `;
    }).join('');
}

function updateAgentButtons() {
    document.querySelectorAll('.agent-btn').forEach(btn => {
        const agent = btn.dataset.agent;
        const isActive = appState.editingAgent === agent;

        if (isActive) {
            btn.className = 'agent-btn px-1 py-2 rounded bg-primary text-white text-xs font-bold cursor-pointer border border-primary shadow-[0_0_8px_rgba(255,71,87,0.3)] transition-all truncate text-center';
        } else {
            btn.className = 'agent-btn px-1 py-2 rounded bg-surface-lighter hover:bg-border-dark hover:text-primary hover:border-primary/50 text-xs font-medium cursor-pointer border border-transparent transition-all truncate text-center';
        }
    });
}

function updateWeaponButtons() {
    document.querySelectorAll('.weapon-btn').forEach(btn => {
        const weapon = btn.dataset.weapon;
        const isActive = appState.editingWeapon === weapon;

        if (isActive) {
            btn.className = 'weapon-btn px-1 py-2 rounded bg-primary text-white text-xs font-bold cursor-pointer border border-primary shadow-[0_0_8px_rgba(255,71,87,0.3)] transition-all truncate text-center';
        } else {
            btn.className = 'weapon-btn px-1 py-2 rounded bg-surface-lighter hover:bg-border-dark hover:text-primary hover:border-primary/50 text-xs font-medium cursor-pointer border border-transparent transition-all truncate text-center';
        }
    });
}

function toggleTag(tag) {
    const index = appState.editingTags.indexOf(tag);
    if (index > -1) {
        appState.editingTags.splice(index, 1);
    } else {
        appState.editingTags.push(tag);
    }
    updateTagButtons();
    renderCustomTagButtons();
    renderDynamicPresetTags();
}

function selectAgent(agent) {
    if (appState.editingAgent === agent) {
        const idx = appState.editingTags.indexOf(agent);
        if (idx > -1) appState.editingTags.splice(idx, 1);
        appState.editingAgent = null;
    } else {
        if (appState.editingAgent) {
            const idx = appState.editingTags.indexOf(appState.editingAgent);
            if (idx > -1) appState.editingTags.splice(idx, 1);
        }
        appState.editingAgent = agent;
        if (!appState.editingTags.includes(agent)) {
            appState.editingTags.push(agent);
        }
    }
    updateAgentButtons();
    updateTagButtons();
}

function selectWeapon(weapon) {
    if (appState.editingWeapon === weapon) {
        const idx = appState.editingTags.indexOf(weapon);
        if (idx > -1) appState.editingTags.splice(idx, 1);
        appState.editingWeapon = null;
    } else {
        if (appState.editingWeapon) {
            const idx = appState.editingTags.indexOf(appState.editingWeapon);
            if (idx > -1) appState.editingTags.splice(idx, 1);
        }
        appState.editingWeapon = weapon;
        if (!appState.editingTags.includes(weapon)) {
            appState.editingTags.push(weapon);
        }
    }
    updateWeaponButtons();
    updateTagButtons();
}

function addCustomTag() {
    const input = document.getElementById('custom-tag-input');
    if (!input) return;

    const tag = input.value.trim();
    if (!tag) return;

    if (!appState.customTags.includes(tag)) {
        appState.customTags.push(tag);
    }
    if (!appState.editingTags.includes(tag)) {
        appState.editingTags.push(tag);
    }

    input.value = '';
    renderCustomTagButtons();
    updateTagButtons();
}

// ==================== 时间线逻辑 ====================

function initTimeline() {
    const container = document.getElementById('timeline-container');
    const startHandle = document.getElementById('timeline-handle-start');
    const endHandle = document.getElementById('timeline-handle-end');

    if (!container || !startHandle || !endHandle) return;

    let isDragging = null;

    const getTimeFromPosition = (x) => {
        const rect = container.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
        return percent * appState.videoDuration;
    };

    const handleDrag = (e) => {
        if (!isDragging) return;

        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const time = getTimeFromPosition(clientX);

        if (isDragging === 'start') {
            appState.editingStartTime = Math.min(time, appState.editingEndTime - 0.5);
            appState.editingStartTime = Math.max(0, appState.editingStartTime);
            updateTimelineDisplay();
            updateTimeDisplay();
        } else if (isDragging === 'end') {
            appState.editingEndTime = Math.max(time, appState.editingStartTime + 0.5);
            appState.editingEndTime = Math.min(appState.videoDuration, appState.editingEndTime);
            updateTimelineDisplay();
            updateTimeDisplay();
        } else if (isDragging === 'seek') {
            const videoPlayer = document.getElementById('video-player');
            if (videoPlayer) videoPlayer.currentTime = time;
        }
    };

    const stopDrag = () => {
        isDragging = null;
        document.removeEventListener('mousemove', handleDrag);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchmove', handleDrag);
        document.removeEventListener('touchend', stopDrag);
    };

    startHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        isDragging = 'start';
        document.addEventListener('mousemove', handleDrag);
        document.addEventListener('mouseup', stopDrag);
    });

    endHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        isDragging = 'end';
        document.addEventListener('mousemove', handleDrag);
        document.addEventListener('mouseup', stopDrag);
    });

    container.addEventListener('click', (e) => {
        if (e.target.closest('#timeline-handle-start') || e.target.closest('#timeline-handle-end')) return;
        const time = getTimeFromPosition(e.clientX);
        const videoPlayer = document.getElementById('video-player');
        if (videoPlayer) videoPlayer.currentTime = time;
    });

    container.addEventListener('mousedown', (e) => {
        if (e.target.closest('#timeline-handle-start') || e.target.closest('#timeline-handle-end')) return;
        isDragging = 'seek';
        handleDrag(e);
        document.addEventListener('mousemove', handleDrag);
        document.addEventListener('mouseup', stopDrag);
    });
}

function updateTimelineDisplay() {
    const rangeElement = document.getElementById('timeline-range');
    if (!rangeElement || !appState.videoDuration) return;

    const startPercent = (appState.editingStartTime / appState.videoDuration) * 100;
    const endPercent = (appState.editingEndTime / appState.videoDuration) * 100;

    rangeElement.style.left = `${startPercent}%`;
    rangeElement.style.right = `${100 - endPercent}%`;
}

function updateTimeDisplay() {
    const startTimeEl = document.getElementById('start-time-display');
    const endTimeEl = document.getElementById('end-time-display');

    if (startTimeEl) startTimeEl.textContent = formatTimeMs(appState.editingStartTime);
    if (endTimeEl) endTimeEl.textContent = formatTimeMs(appState.editingEndTime);
}

function updatePlayhead() {
    const playhead = document.getElementById('playhead');
    const videoPlayer = document.getElementById('video-player');

    if (!playhead || !videoPlayer || !appState.videoDuration) return;

    const percent = (videoPlayer.currentTime / appState.videoDuration) * 100;
    playhead.style.left = `${percent}%`;
}

// ==================== 播放器控件 ====================

function initPlayerControls() {
    const volumeSlider = document.getElementById('volume-slider');
    if (volumeSlider) {
        volumeSlider.value = appState.volume * 100;
        volumeSlider.addEventListener('input', (e) => {
            setVolume(e.target.value / 100);
        });
    }
    updateSpeedDisplay();
}

function togglePlay() {
    const videoPlayer = document.getElementById('video-player');
    if (!videoPlayer) return;

    if (videoPlayer.paused) {
        if (videoPlayer.currentTime < appState.editingStartTime ||
            videoPlayer.currentTime >= appState.editingEndTime) {
            videoPlayer.currentTime = appState.editingStartTime;
        }
        videoPlayer.play();
    } else {
        videoPlayer.pause();
    }
}

function updatePlayButton() {
    const playBtn = document.getElementById('play-btn');
    const playOverlay = document.getElementById('play-overlay');
    const videoPlayer = document.getElementById('video-player');
    if (!videoPlayer) return;

    const isPaused = videoPlayer.paused;

    if (playBtn) {
        const icon = playBtn.querySelector('.material-symbols-outlined');
        if (icon) icon.textContent = isPaused ? 'play_arrow' : 'pause';
    }

    if (playOverlay) {
        const icon = playOverlay.querySelector('.material-symbols-outlined');
        if (icon) icon.textContent = isPaused ? 'play_arrow' : 'pause';
    }
}

function skipPrev() {
    const videoPlayer = document.getElementById('video-player');
    if (videoPlayer) videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 5);
}

function skipNext() {
    const videoPlayer = document.getElementById('video-player');
    if (videoPlayer) videoPlayer.currentTime = Math.min(appState.videoDuration, videoPlayer.currentTime + 5);
}

function setPlaybackSpeed(speed) {
    appState.playbackSpeed = speed;
    const videoPlayer = document.getElementById('video-player');
    if (videoPlayer) videoPlayer.playbackRate = speed;
    updateSpeedDisplay();
    const speedMenu = document.getElementById('speed-menu');
    if (speedMenu) speedMenu.classList.add('hidden');
}

function updateSpeedDisplay() {
    const speedDisplay = document.getElementById('speed-display');
    if (speedDisplay) speedDisplay.textContent = `${appState.playbackSpeed}x`;
}

function toggleSpeedMenu() {
    const speedMenu = document.getElementById('speed-menu');
    if (speedMenu) speedMenu.classList.toggle('hidden');
}

function setVolume(value) {
    appState.volume = value;
    appState.isMuted = value === 0;
    const videoPlayer = document.getElementById('video-player');
    if (videoPlayer) {
        videoPlayer.volume = value;
        videoPlayer.muted = appState.isMuted;
    }
    updateVolumeIcon();
}

function toggleMute() {
    const videoPlayer = document.getElementById('video-player');
    if (!videoPlayer) return;
    appState.isMuted = !appState.isMuted;
    videoPlayer.muted = appState.isMuted;
    updateVolumeIcon();
}

function updateVolumeIcon() {
    const volumeBtn = document.getElementById('volume-btn');
    if (!volumeBtn) return;
    const icon = volumeBtn.querySelector('.material-symbols-outlined');
    if (icon) {
        if (appState.isMuted || appState.volume === 0) {
            icon.textContent = 'volume_off';
        } else if (appState.volume < 0.5) {
            icon.textContent = 'volume_down';
        } else {
            icon.textContent = 'volume_up';
        }
    }
}

function toggleFullscreen() {
    const videoContainer = document.querySelector('.aspect-video');
    if (!videoContainer) return;
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        videoContainer.requestFullscreen();
    }
}

// ==================== 文件列表 ====================

function renderFileList() {
    const container = document.getElementById('file-list');
    if (!container) return;

    // 快速标记模式：显示全局新视频列表；普通模式：显示当前文件夹
    let videoList;
    let titleText;

    if (appState.quickTagMode && appState.quickTagVideos.length > 0) {
        videoList = appState.quickTagVideos;
        titleText = '所有新视频';
    } else {
        videoList = appState.allVideos.filter(v => v.folder === appState.currentVideo.folder);
        titleText = '当前文件夹';
    }

    const currentIdx = videoList.findIndex(v => v.path === appState.currentVideo.path) + 1;
    const countEl = document.getElementById('file-count');
    if (countEl) countEl.textContent = `${currentIdx}/${videoList.length}`;

    // 更新标题
    const titleEl = document.querySelector('aside h3');
    if (titleEl && appState.quickTagMode) {
        titleEl.textContent = titleText;
    }

    container.innerHTML = videoList.map((video) => {
        const isCurrent = video.path === appState.currentVideo.path;
        const isSaved = !video.meta.is_new;
        const globalIndex = appState.allVideos.indexOf(video);
        const displayDuration = video.duration || video.meta.end_time || 0;
        const folderName = video.folder.split(/[/\\]/).pop();

        return `
            <div class="flex gap-3 p-2 rounded ${isCurrent
                ? 'bg-surface-lighter border-l-2 border-primary shadow-lg'
                : isSaved ? 'bg-surface-dark hover:bg-surface-lighter opacity-60' : 'hover:bg-surface-lighter'
            } transition-colors cursor-pointer group" onclick="switchToVideo(${globalIndex})">
                <div class="w-20 h-12 bg-gray-800 rounded overflow-hidden relative shrink-0 ${isCurrent ? 'ring-1 ring-white/10' : ''}">
                    ${video.thumbnail
                ? `<img src="${video.thumbnail}" class="w-full h-full object-cover" alt="">`
                : `<div class="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                            <span class="material-symbols-outlined text-gray-600 text-lg">movie</span>
                        </div>`
            }
                    <div class="absolute bottom-0 right-0 bg-black/70 px-1 text-[8px] font-mono text-white">${formatTime(displayDuration)}</div>
                    ${isSaved ? `<div class="absolute inset-0 flex items-center justify-center bg-black/50">
                        <span class="material-symbols-outlined text-green-500 text-lg">check_circle</span>
                    </div>` : ''}
                </div>
                <div class="flex flex-col justify-center min-w-0">
                    <p class="text-xs font-bold ${isCurrent ? 'text-white' : isSaved ? 'text-gray-400 line-through' : 'text-gray-300 group-hover:text-white'} truncate">${video.filename}</p>
                    <p class="text-[10px] ${isCurrent ? 'text-primary' : 'text-gray-500'}">
                        ${isCurrent
                ? '<span class="size-1.5 rounded-full bg-primary animate-pulse inline-block mr-1"></span>编辑中'
                : isSaved ? `已保存 • ${video.meta.tags?.length || 0} 标签` : (appState.quickTagMode ? folderName : formatFileSize(video.size))
            }
                    </p>
                </div>
            </div>
        `;
    }).join('');
}

async function switchToVideo(globalIndex) {
    // 保存当前编辑状态到 pendingChanges（不写入文件）
    saveToPendingChanges();

    appState.currentVideoIndex = globalIndex;
    appState.currentVideo = appState.allVideos[globalIndex];

    // 检查是否有该视频的待保存更改
    const pendingData = appState.pendingChanges[appState.currentVideo.path];
    if (pendingData) {
        appState.editingTags = [...pendingData.tags];
        appState.editingAgent = pendingData.agent;
        appState.editingWeapon = pendingData.weapon;
        appState.editingStartTime = pendingData.start_time;
        appState.editingEndTime = pendingData.end_time;
    } else {
        appState.editingTags = [...(appState.currentVideo.meta.tags || [])];
        appState.editingAgent = appState.currentVideo.meta.agent || null;
        appState.editingWeapon = appState.currentVideo.meta.weapon || null;
        appState.editingStartTime = appState.currentVideo.meta.start_time || 0;
        appState.editingEndTime = appState.currentVideo.meta.end_time || 0;
    }

    appState.customTags = [];

    sessionStorage.setItem('currentVideo', JSON.stringify({
        index: globalIndex,
        video: appState.currentVideo
    }));

    renderEditorUI();
    setupVideoPlayer();
    renderFileList();
}

function nextVideo() {
    const folderVideos = appState.allVideos.filter(v => v.folder === appState.currentVideo.folder);
    const currentIdx = folderVideos.findIndex(v => v.filename === appState.currentVideo.filename);

    if (currentIdx < folderVideos.length - 1) {
        const nextVideoInFolder = folderVideos[currentIdx + 1];
        const globalIndex = appState.allVideos.indexOf(nextVideoInFolder);
        switchToVideo(globalIndex);
    } else {
        showToast('已是最后一个视频', 'info');
    }
}

// ==================== 保存逻辑 ====================

async function saveCurrentEditing(markAsSaved = false) {
    if (!appState.currentVideo) return false;

    appState.currentVideo.meta.tags = [...appState.editingTags];
    appState.currentVideo.meta.agent = appState.editingAgent;
    appState.currentVideo.meta.weapon = appState.editingWeapon;
    appState.currentVideo.meta.start_time = appState.editingStartTime;
    appState.currentVideo.meta.end_time = appState.editingEndTime;

    if (markAsSaved) {
        appState.currentVideo.meta.is_new = false;
    }

    const meta = await window.highlightAPI.loadMeta(appState.currentVideo.folder);
    meta.videos[appState.currentVideo.filename] = appState.currentVideo.meta;

    const result = await window.highlightAPI.saveMeta(appState.currentVideo.folder, meta);

    if (result.success) {
        appState.allVideos[appState.currentVideoIndex] = appState.currentVideo;
        sessionStorage.setItem('allVideos', JSON.stringify(appState.allVideos));
        return true;
    } else {
        console.error('保存失败:', result.error);
        return false;
    }
}

async function finishAndSave() {
    // 先保存当前编辑到 pendingChanges
    saveToPendingChanges();

    // 批量保存所有待保存的视频
    const success = await saveAllPendingChanges();

    if (success) {
        // 检查当前文件夹是否还有新视频
        const folderVideos = appState.allVideos.filter(v => v.folder === appState.currentVideo.folder);
        const newVideosCount = folderVideos.filter(v => v.meta.is_new).length;

        if (newVideosCount === 0) {
            // 所有视频都处理完了，返回 Dashboard
            showToast('保存成功！', 'success');
            setTimeout(() => {
                window.location.href = 'code.html';
            }, 1000);
        } else {
            // 还有新视频待处理，留在编辑器
            showToast(`已保存，还有 ${newVideosCount} 个新视频待处理`, 'info');
            renderFileList();
        }
    } else {
        showToast('保存失败，请重试', 'error');
    }
}

/**
 * 保存当前编辑状态到 pendingChanges（内存中）
 */
function saveToPendingChanges() {
    if (!appState.currentVideo) return;

    appState.pendingChanges[appState.currentVideo.path] = {
        tags: [...appState.editingTags],
        agent: appState.editingAgent,
        weapon: appState.editingWeapon,
        start_time: appState.editingStartTime,
        end_time: appState.editingEndTime
    };

    appState.hasUnsavedChanges = Object.keys(appState.pendingChanges).length > 0;
}

/**
 * 批量保存所有待保存的视频
 */
async function saveAllPendingChanges() {
    // 按文件夹分组待保存的视频
    const folderChanges = {};

    for (const videoPath in appState.pendingChanges) {
        const video = appState.allVideos.find(v => v.path === videoPath);
        if (!video) continue;

        if (!folderChanges[video.folder]) {
            folderChanges[video.folder] = [];
        }

        folderChanges[video.folder].push({
            video,
            changes: appState.pendingChanges[videoPath]
        });
    }

    // 逐个文件夹保存
    let allSuccess = true;

    for (const folderPath in folderChanges) {
        const meta = await window.highlightAPI.loadMeta(folderPath);

        for (const { video, changes } of folderChanges[folderPath]) {
            // 更新视频元数据
            video.meta.tags = [...changes.tags];
            video.meta.agent = changes.agent;
            video.meta.weapon = changes.weapon;
            video.meta.start_time = changes.start_time;
            video.meta.end_time = changes.end_time;
            video.meta.is_new = false;

            meta.videos[video.filename] = video.meta;
        }

        const result = await window.highlightAPI.saveMeta(folderPath, meta);

        if (!result.success) {
            console.error('保存失败:', folderPath, result.error);
            allSuccess = false;
        }
    }

    if (allSuccess) {
        // 清空待保存记录
        appState.pendingChanges = {};
        appState.hasUnsavedChanges = false;
        sessionStorage.setItem('allVideos', JSON.stringify(appState.allVideos));
    }

    return allSuccess;
}

/**
 * 检查是否有未保存的更改
 */
function checkUnsavedChanges() {
    // 如果没有初始状态，不提示
    if (!appState.initialState) return false;

    // 检查当前编辑状态是否与初始状态不同
    const initial = appState.initialState;

    if (JSON.stringify(appState.editingTags.slice().sort()) !== JSON.stringify((initial.tags || []).slice().sort())) return true;
    if (appState.editingAgent !== initial.agent) return true;
    if (appState.editingWeapon !== initial.weapon) return true;
    if (Math.abs(appState.editingStartTime - initial.start_time) > 0.01) return true;
    if (Math.abs(appState.editingEndTime - initial.end_time) > 0.01) return true;

    // 检查是否有其他待保存的视频
    return Object.keys(appState.pendingChanges).length > 0;
}

function discardEditing() {
    const hasChanges = checkUnsavedChanges();

    if (hasChanges) {
        if (confirm('当前有未完成的标记，确定要离开吗？')) {
            appState.pendingChanges = {};
            appState.hasUnsavedChanges = false;
            window.location.href = 'code.html';
        }
    } else {
        window.location.href = 'code.html';
    }
}

/**
 * 返回首页（带保护）
 */
function goToHome() {
    discardEditing();
}

// ==================== 初始化 ====================

async function initDashboard() {
    await loadGlobalConfig();

    const savedVideos = sessionStorage.getItem('allVideos');
    if (savedVideos) {
        appState.allVideos = JSON.parse(savedVideos);
        sessionStorage.removeItem('allVideos');
        sessionStorage.removeItem('currentVideo');
        sessionStorage.removeItem('presetTags');
    }

    if (appState.allVideos.length === 0 && appState.importedFolders.length > 0) {
        await loadAllVideos();
    } else if (appState.allVideos.length > 0) {
        loadVideoMetadataAsync();
    }

    renderFolderList();
    renderVideoGrid();
    renderTagFilterList();
    updateSortButtonsUI();

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.addEventListener('input', handleSearch);

    const importBtn = document.getElementById('import-folder-btn');
    if (importBtn) importBtn.addEventListener('click', importFolder);

    const quickTagBtn = document.getElementById('quick-tag-btn');
    if (quickTagBtn) quickTagBtn.addEventListener('click', quickTag);

    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) settingsBtn.addEventListener('click', openSettings);

    const showAllBtn = document.getElementById('show-all-videos-btn');
    if (showAllBtn) showAllBtn.addEventListener('click', showAllVideos);
}

document.addEventListener('DOMContentLoaded', () => {
    // 窗口控制按钮事件监听器
    const minBtn = document.getElementById('min-btn');
    const maxBtn = document.getElementById('max-btn');
    const closeBtn = document.getElementById('close-btn');

    if (minBtn) minBtn.addEventListener('click', () => window.windowAPI.minimize());
    if (maxBtn) maxBtn.addEventListener('click', () => window.windowAPI.maximize());
    if (closeBtn) closeBtn.addEventListener('click', () => window.windowAPI.close());

    // 根据页面初始化对应功能
    if (window.location.pathname.includes('code2.html')) {
        initEditor();
    } else {
        initDashboard();
    }
});
