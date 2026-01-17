/**
 * Electron 主进程
 * 负责创建窗口和处理文件系统操作
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// 元数据文件名
const META_FILENAME = '.highlight_meta.json';
// 全局配置文件名
const CONFIG_FILENAME = 'app_config.json';

let mainWindow;

/**
 * 获取配置文件路径（在应用目录下）
 */
function getConfigPath() {
    return path.join(__dirname, CONFIG_FILENAME);
}

/**
 * 创建主窗口
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 700,
        frame: false, // 无边框窗口，使用自定义标题栏
        backgroundColor: '#230f11',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // 加载 Dashboard 页面
    mainWindow.loadFile('code.html');

    // 开发模式下打开开发者工具
    // mainWindow.webContents.openDevTools();
}

// 应用就绪时创建窗口
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// 所有窗口关闭时退出应用（macOS 除外）
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// ==================== IPC 处理器 ====================

/**
 * 选择文件夹对话框
 */
ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: '选择视频文件夹'
    });

    if (result.canceled) {
        return null;
    }
    return result.filePaths[0];
});

/**
 * 扫描文件夹获取 MP4 文件列表
 * @param {string} folderPath - 文件夹路径
 * @returns {Array} 视频文件信息数组
 */
ipcMain.handle('scan-folder', async (event, folderPath) => {
    try {
        const files = fs.readdirSync(folderPath);
        const mp4Files = files.filter(file =>
            file.toLowerCase().endsWith('.mp4')
        );

        // 获取每个文件的详细信息
        const videoInfos = mp4Files.map(filename => {
            const filePath = path.join(folderPath, filename);
            const stats = fs.statSync(filePath);
            return {
                filename: filename,
                path: filePath,
                folder: folderPath,
                size: stats.size,
                mtime: stats.mtime.getTime()
            };
        });

        return videoInfos;
    } catch (error) {
        console.error('扫描文件夹失败:', error);
        return [];
    }
});

/**
 * 加载文件夹的元数据
 * @param {string} folderPath - 文件夹路径
 * @returns {Object} 元数据对象
 */
ipcMain.handle('load-meta', async (event, folderPath) => {
    const metaPath = path.join(folderPath, META_FILENAME);

    try {
        if (fs.existsSync(metaPath)) {
            const content = fs.readFileSync(metaPath, 'utf-8');
            return JSON.parse(content);
        }
    } catch (error) {
        console.error('加载元数据失败:', error);
    }

    // 返回默认结构
    return { videos: {} };
});

/**
 * 保存元数据到文件夹
 * @param {string} folderPath - 文件夹路径
 * @param {Object} data - 元数据对象
 */
ipcMain.handle('save-meta', async (event, folderPath, data) => {
    const metaPath = path.join(folderPath, META_FILENAME);

    try {
        // Windows 平台：使用"解锁-写入-加锁"模式
        if (process.platform === 'win32') {
            // Step A: 解锁 - 移除隐藏属性（忽略错误，文件可能不存在或未隐藏）
            await removeHiddenAttribute(metaPath);
        }

        // Step B: 写入文件
        fs.writeFileSync(metaPath, JSON.stringify(data, null, 2), 'utf-8');

        // Step C: 加锁 - 重新设置隐藏属性
        if (process.platform === 'win32') {
            await setHiddenAttribute(metaPath);
        }

        return { success: true };
    } catch (error) {
        // 输出详细错误信息用于调试
        console.error('保存元数据失败:', error);
        console.error('错误代码:', error.code);
        console.error('错误路径:', error.path);
        return { success: false, error: error.message };
    }
});

/**
 * 移除文件隐藏属性（仅 Windows）
 * @param {string} filePath - 文件路径
 * @returns {Promise} 完成时 resolve
 */
function removeHiddenAttribute(filePath) {
    return new Promise((resolve) => {
        // 使用 attrib -h 移除隐藏属性
        const command = `attrib -h "${filePath}"`;

        exec(command, (error, stdout, stderr) => {
            // 忽略所有错误（文件可能不存在或未隐藏）
            if (error) {
                console.log('移除隐藏属性（可忽略）:', error.message);
            }
            resolve();
        });
    });
}

/**
 * 设置文件隐藏属性（仅 Windows）
 * @param {string} filePath - 文件路径
 * @returns {Promise} 完成时 resolve
 */
function setHiddenAttribute(filePath) {
    return new Promise((resolve) => {
        // 使用 attrib +h 设置隐藏属性
        const command = `attrib +h "${filePath}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.warn('设置隐藏属性失败（可忽略）:', error.message);
            }
            resolve();
        });
    });
}

/**
 * 获取视频时长（秒）
 * 注意：这里返回模拟值，实际需要使用 ffprobe 或其他库
 */
ipcMain.handle('get-video-duration', async (event, videoPath) => {
    // 暂时返回模拟时长，后续可集成 ffprobe
    return 105; // 1:45
});

// ==================== 全局配置 ====================

/**
 * 加载全局配置
 * @returns {Object} 配置对象
 */
ipcMain.handle('load-config', async () => {
    const configPath = getConfigPath();

    try {
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf-8');
            return JSON.parse(content);
        }
    } catch (error) {
        console.error('加载配置失败:', error);
    }

    // 返回默认配置
    return {
        presetTags: ['三杀', '四杀', '五杀', '残局', '一血'],
        importedFolders: []
    };
});

/**
 * 保存全局配置
 * @param {Object} config - 配置对象
 */
ipcMain.handle('save-config', async (event, config) => {
    const configPath = getConfigPath();

    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
        return { success: true };
    } catch (error) {
        console.error('保存配置失败:', error);
        return { success: false, error: error.message };
    }
});

// ==================== 窗口控制 ====================

ipcMain.on('window-minimize', () => {
    mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
});

ipcMain.on('window-close', () => {
    mainWindow.close();
});
