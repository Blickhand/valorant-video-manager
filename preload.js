/**
 * 预加载脚本
 * 通过 contextBridge 安全地暴露 API 给渲染进程
 */

const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 到渲染进程
contextBridge.exposeInMainWorld('highlightAPI', {
    /**
     * 打开文件夹选择对话框
     * @returns {Promise<string|null>} 选中的文件夹路径，取消则返回 null
     */
    selectFolder: () => ipcRenderer.invoke('select-folder'),

    /**
     * 扫描文件夹获取 MP4 文件列表
     * @param {string} folderPath - 文件夹路径
     * @returns {Promise<Array>} 视频文件信息数组
     */
    scanFolder: (folderPath) => ipcRenderer.invoke('scan-folder', folderPath),

    /**
     * 加载文件夹的元数据
     * @param {string} folderPath - 文件夹路径
     * @returns {Promise<Object>} 元数据对象
     */
    loadMeta: (folderPath) => ipcRenderer.invoke('load-meta', folderPath),

    /**
     * 保存元数据到文件夹
     * @param {string} folderPath - 文件夹路径
     * @param {Object} data - 元数据对象
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    saveMeta: (folderPath, data) => ipcRenderer.invoke('save-meta', folderPath, data),

    /**
     * 获取视频时长
     * @param {string} videoPath - 视频文件路径
     * @returns {Promise<number>} 时长（秒）
     */
    getVideoDuration: (videoPath) => ipcRenderer.invoke('get-video-duration', videoPath)
});

// 暴露全局配置 API
contextBridge.exposeInMainWorld('configAPI', {
    /**
     * 加载全局配置
     * @returns {Promise<Object>} 配置对象
     */
    loadConfig: () => ipcRenderer.invoke('load-config'),

    /**
     * 保存全局配置
     * @param {Object} config - 配置对象
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    saveConfig: (config) => ipcRenderer.invoke('save-config', config)
});

// 暴露窗口控制 API
contextBridge.exposeInMainWorld('windowAPI', {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize-toggle'),
    close: () => ipcRenderer.send('window-close')
});
