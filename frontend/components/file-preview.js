/**
 * 文件预览模块（非 ES Module 版本）
 * 
 * 功能：
 * - 识别消息中的文件路径
 * - 生成预览 URL
 * - 渲染文件预览（图片、PDF）
 * - 图片点击弹框预览
 */

// 文件类型配置
const FILE_TYPES = {
  image: {
    extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'],
    icon: 'image',
    preview: true
  },
  pdf: {
    extensions: ['.pdf'],
    icon: 'file-text',
    preview: true
  },
  document: {
    extensions: ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'],
    icon: 'file',
    preview: false
  },
  code: {
    extensions: ['.js', '.ts', '.py', '.java', '.cpp', '.json', '.md'],
    icon: 'code',
    preview: false
  },
  other: {
    extensions: [],
    icon: 'file',
    preview: false
  }
};

/**
 * 从消息文本中提取文件路径
 * 
 * @param {string} text - 消息文本
 * @returns {Array} 文件列表
 */
function extractFiles(text) {
  const files = [];
  
  // 支持的文件扩展名
  const extensions = 'png|jpg|jpeg|gif|webp|svg|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|json';
  
  // 匹配任何包含文件扩展名的路径
  const pattern = new RegExp(
    `([^\\s<>"']*\\.(${extensions}))`,
    'gi'
  );
  
  let match;
  while ((match = pattern.exec(text)) !== null) {
    let filePath = match[1];
    
    // 🔧 清理 Markdown 反引号和其他符号
    filePath = filePath
      .replace(/^`+|`+$/g, '')  // 移除开头和结尾的反引号
      .replace(/^\*+|\*+$/g, '') // 移除开头和结尾的星号
      .replace(/^_+|_+$/g, '')   // 移除开头和结尾的下划线
      .trim();
    
    const filename = filePath.split('/').pop();
    
    // 去重
    if (!files.find(f => f.path === filePath)) {
      files.push({
        path: filePath,
        name: filename,
        type: getFileType(filename)
      });
    }
  }
  
  return files;
}

/**
 * 获取文件类型
 */
function getFileType(filename) {
  const ext = '.' + filename.split('.').pop().toLowerCase();
  
  for (const [type, config] of Object.entries(FILE_TYPES)) {
    if (config.extensions.includes(ext)) {
      return type;
    }
  }
  
  return 'other';
}

/**
 * 获取文件图标
 */
function getFileIcon(type) {
  return FILE_TYPES[type]?.icon || 'file';
}

/**
 * 生成文件预览 URL
 */
function getFileUrl(filePath, options = {}) {
  const { token } = options;
  
  // 提取相对路径
  let cleanPath = filePath;
  
  // 处理完整路径：/root/.openclaw/workspace/filename.ext
  if (cleanPath.includes('/root/.openclaw/workspace/')) {
    cleanPath = cleanPath.split('/root/.openclaw/workspace/')[1];
  }
  // 处理相对路径：/workspace/filename.ext
  else if (cleanPath.startsWith('/workspace/')) {
    cleanPath = cleanPath.replace('/workspace/', '');
  }
  // 处理当前目录：./filename.ext
  else if (cleanPath.startsWith('./')) {
    cleanPath = cleanPath.replace('./', '');
  }
  
  // 使用 /api/files/preview 端点（通过后端代理）
  const baseUrl = window.location.origin;
  let url = `${baseUrl}/api/files/preview?path=${encodeURIComponent(cleanPath)}`;
  
  // 优先使用传入的 token，否则从 localStorage 获取
  const actualToken = token || localStorage.getItem('lingxi_token');
  if (actualToken) {
    url += `&token=${encodeURIComponent(actualToken)}`;
  }
  
  return url;
}

/**
 * 显示图片预览弹框（带下载功能）
 */
function showImagePreview(url, filename) {
  // 移除已存在的弹框
  const existingModal = document.getElementById('image-preview-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // 创建弹框
  const modal = document.createElement('div');
  modal.id = 'image-preview-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    cursor: zoom-out;
  `;
  
  // 图片容器
  const imgContainer = document.createElement('div');
  imgContainer.style.cssText = `
    position: relative;
    max-width: 90%;
    max-height: 90%;
  `;
  
  // 图片
  const img = document.createElement('img');
  img.src = url;
  img.alt = filename;
  img.style.cssText = `
    max-width: 100%;
    max-height: 85vh;
    object-fit: contain;
    border-radius: 8px;
    cursor: zoom-in;
  `;
  
  // 图片加载中提示
  img.onload = () => {
    // 图片加载成功后启用缩放
    let scale = 1;
    img.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      scale = Math.min(Math.max(0.5, scale + delta), 4);
      img.style.transform = `scale(${scale})`;
    });
  };
  
  // 顶部工具栏
  const toolbar = document.createElement('div');
  toolbar.style.cssText = `
    position: absolute;
    top: -50px;
    right: 0;
    display: flex;
    gap: 10px;
  `;
  
  // 下载按钮
  const downloadBtn = document.createElement('button');
  downloadBtn.innerHTML = '⬇️';
  downloadBtn.title = '下载图片';
  downloadBtn.style.cssText = `
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;
    font-size: 20px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  `;
  downloadBtn.onmouseenter = () => downloadBtn.style.background = 'rgba(255, 255, 255, 0.3)';
  downloadBtn.onmouseleave = () => downloadBtn.style.background = 'rgba(255, 255, 255, 0.2)';
  downloadBtn.onclick = (e) => {
    e.stopPropagation();
    // 下载图片
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'image.jpg';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  
  // 关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '✕';
  closeBtn.style.cssText = `
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;
    font-size: 24px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  `;
  closeBtn.onmouseenter = () => closeBtn.style.background = 'rgba(255, 255, 255, 0.3)';
  closeBtn.onmouseleave = () => closeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
  
  // 文件名
  const filenameEl = document.createElement('div');
  filenameEl.textContent = filename;
  filenameEl.style.cssText = `
    position: absolute;
    bottom: -35px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.6);
    color: white;
    padding: 6px 16px;
    border-radius: 20px;
    font-size: 14px;
    white-space: nowrap;
  `;
  
  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
  
  // 关闭按钮点击
  closeBtn.addEventListener('click', () => modal.remove());
  
  // ESC 关闭
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);
  
  // 组装
  toolbar.appendChild(downloadBtn);
  toolbar.appendChild(closeBtn);
  imgContainer.appendChild(img);
  imgContainer.appendChild(toolbar);
  imgContainer.appendChild(filenameEl);
  modal.appendChild(imgContainer);
  document.body.appendChild(modal);
}

/**
 * 渲染文件附件
 */
function renderFileAttachments(files, options = {}) {
  if (!files || files.length === 0) {
    return '';
  }
  
  let html = '<div class="file-attachments">';
  
  files.forEach(file => {
    const fileUrl = getFileUrl(file.path, options);
    const icon = getFileIcon(file.type);
    
    if (!fileUrl) {
      html += `
        <div class="file-card error">
          <div class="file-icon">
            <i data-lucide="alert-circle" class="icon-lg"></i>
          </div>
          <div class="file-info">
            <span class="file-name">${file.name}</span>
            <span class="file-error">无法预览：未配置服务器</span>
          </div>
        </div>
      `;
      return;
    }
    
    // 图片类型 - 小尺寸预览 + 点击弹框
    if (file.type === 'image') {
      html += `
        <div class="file-card image-card" style="max-width: 280px;">
          <img src="${fileUrl}" 
               alt="${file.name}" 
               class="file-preview-image"
               style="height: 150px; object-fit: cover; cursor: zoom-in;"
               onclick="showImagePreview('${fileUrl}', '${file.name}')"
               loading="lazy"
               onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22>加载失败</text></svg>'" />
          <div class="file-info" style="display: flex; align-items: center; gap: 8px;">
            <i data-lucide="image" style="width: 14px; height: 14px;"></i>
            <span class="file-name" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.name}</span>
            <i data-lucide="zoom-in" style="width: 14px; height: 14px; opacity: 0.5;"></i>
          </div>
        </div>
      `;
    }
    // PDF 类型
    else if (file.type === 'pdf') {
      html += `
        <div class="file-card pdf-card">
          <div class="file-icon">
            <i data-lucide="${icon}" class="icon-lg"></i>
          </div>
          <div class="file-info">
            <span class="file-name">${file.name}</span>
            <span class="file-type">PDF 文档</span>
          </div>
          <div class="file-actions">
            <button onclick="window.open('${fileUrl}', '_blank')" class="file-btn">
              <i data-lucide="eye" class="icon-sm"></i> 预览
            </button>
            <button onclick="downloadFile('${fileUrl}', '${file.name}')" class="file-btn">
              <i data-lucide="download" class="icon-sm"></i> 下载
            </button>
          </div>
        </div>
      `;
    }
    // 其他类型
    else {
      html += `
        <div class="file-card">
          <div class="file-icon">
            <i data-lucide="${icon}" class="icon-lg"></i>
          </div>
          <div class="file-info">
            <span class="file-name">${file.name}</span>
            <span class="file-type">${file.type.toUpperCase()} 文件</span>
          </div>
          <div class="file-actions">
            <button onclick="downloadFile('${fileUrl}', '${file.name}')" class="file-btn">
              <i data-lucide="download" class="icon-sm"></i> 下载
            </button>
          </div>
        </div>
      `;
    }
  });
  
  html += '</div>';
  return html;
}

/**
 * 下载文件
 */
window.downloadFile = function(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

/**
 * 提取 Markdown 图片语法
 * 支持：![alt](url) 和 ![alt](url "title")
 */
function extractMarkdownImages(text) {
  const images = [];
  // 匹配 ![alt](url) 或 ![alt](url "title")
  const pattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
  
  let match;
  while ((match = pattern.exec(text)) !== null) {
    images.push({
      fullMatch: match[0],
      alt: match[1] || 'image',
      url: match[2],
      title: match[3] || ''
    });
  }
  
  return images;
}

/**
 * 解析消息中的 Markdown 图片并转换为 HTML
 */
function parseMarkdownImages(text, options = {}) {
  if (!text) return { text: '', imagesHtml: '' };
  
  const images = extractMarkdownImages(text);
  let cleanText = text;
  const imageElements = [];
  
  images.forEach(img => {
    // 从文本中移除 Markdown 图片语法
    cleanText = cleanText.replace(img.fullMatch, '').trim();
    
    // 生成图片 HTML
    imageElements.push(`
      <div class="message-image" style="margin: 8px 0;">
        <img src="${img.url}" 
             alt="${img.alt}" 
             style="max-width: 100%; max-height: 400px; border-radius: 8px; cursor: zoom-in;"
             onclick="showImagePreview('${img.url}', '${img.alt}')"
             loading="lazy"
             onerror="this.onerror=null; this.style.display='none'; this.insertAdjacentHTML('afterend', '<div style=\\'color:#ef4444;font-size:12px;\\'>图片加载失败</div>');">
      </div>
    `);
  });
  
  return {
    text: cleanText,
    imagesHtml: imageElements.join('')
  };
}

/**
 * 处理消息 - 提取文件并渲染
 */
function processMessage(text, options = {}) {
  const files = extractFiles(text);
  
  // 从文本中移除文件路径
  let cleanText = text;
  files.forEach(file => {
    cleanText = cleanText.replace(file.path, '').trim();
  });
  
  // 生成文件附件 HTML
  const filesHtml = renderFileAttachments(files, options);
  
  return {
    text: cleanText,
    files,
    filesHtml
  };
}

/**
 * 提取音频文件路径
 * 支持 MEDIA:/path/to/audio.mp3 格式
 */
function extractAudioFiles(text) {
  const audioFiles = [];
  const pattern = /MEDIA:([^\s\n]+)/g;
  
  let match;
  while ((match = pattern.exec(text)) !== null) {
    audioFiles.push(match[1]);
  }
  
  return audioFiles;
}

/**
 * 格式化时间为 mm:ss
 */
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 渲染音频播放器
 */
function renderAudioPlayers(audioFiles, options = {}) {
  if (!audioFiles || audioFiles.length === 0) {
    return '';
  }
  
  let html = '<div class="audio-players">';
  
  audioFiles.forEach((audioPath, index) => {
    // 构建音频 URL
    let audioUrl = '';
    
    // 简化：所有 TTS 文件都通过主服务器代理
    // 后端会自动处理本地/远程文件的获取逻辑
    const backendIp = 'lumeword.cn';
    const backendPort = 3000;
    
    // 如果有用户服务器信息，传递 userId 帮助后端快速定位
    const userIdParam = options.userId ? `&userId=${encodeURIComponent(options.userId)}` : '';
    audioUrl = `http://${backendIp}:${backendPort}/api/files/tts?path=${encodeURIComponent(audioPath)}${userIdParam}`;
    // 不在页面加载时打印日志，只在点击播放时打印
    
    const playerId = `audio-player-${index}-${Date.now()}`;
    
    html += `
      <div class="audio-player" style="margin: 8px 0; padding: 12px; background: ${options.isDarkMode ? '#424454' : '#f3f4f6'}; border-radius: 20px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <button id="${playerId}-play" onclick="toggleAudioPlay('${playerId}', '${audioUrl}')" 
            style="width: 36px; height: 36px; border-radius: 50%; border: none; background: #10A37F; cursor: pointer; display: flex; align-items: center; justify-content: center;">
            <svg id="${playerId}-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 14px; font-weight: 500; color: ${options.isDarkMode ? '#ECECF1' : '#1f2937'};">语音消息</span>
              <span id="${playerId}-time" style="font-size: 11px; color: ${options.isDarkMode ? 'rgba(255,255,255,0.7)' : '#6b7280'};">00:00 / 00:00</span>
            </div>
            <div style="height: 3px; background: ${options.isDarkMode ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.12)'}; border-radius: 2px; overflow: hidden;">
              <div id="${playerId}-progress" style="height: 100%; width: 0%; background: #10A37F; transition: width 0.1s;"></div>
            </div>
          </div>
        </div>
        <audio id="${playerId}-audio" preload="metadata" onloadedmetadata="updateAudioDuration('${playerId}')" 
          ontimeupdate="updateAudioProgress('${playerId}')" onended="resetAudioPlay('${playerId}')">
          您的浏览器不支持音频播放
        </audio>
      </div>
    `;
  });
  
  html += '</div>';
  return html;
}

// 全局音频播放器控制
window.toggleAudioPlay = function(playerId, audioUrl) {
  const audio = document.getElementById(`${playerId}-audio`);
  const playBtn = document.getElementById(`${playerId}-play`);
  const icon = document.getElementById(`${playerId}-icon`);
  
  if (!audio) {
    console.error('找不到 audio 元素:', playerId);
    return;
  }
  
  console.log('🎵 播放音频:', audioUrl);
  
  // 设置音频源（必须在播放前设置）
  if (!audio.src || audio.src !== audioUrl) {
    audio.src = audioUrl;
    audio.load();
  }
  
  audio.addEventListener('error', function(e) {
    console.error('❌ 音频加载错误:', e);
  }, { once: true });
  
  audio.play().then(() => {
    console.log('✅ 开始播放');
    // 更新图标为暂停
    icon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
    playBtn.style.background = '#10A37F';
  }).catch(err => {
    console.error('❌ 播放失败:', err);
  });
};

window.resetAudioPlay = function(playerId) {
  const icon = document.getElementById(`${playerId}-icon`);
  const playBtn = document.getElementById(`${playerId}-play`);
  if (icon) icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
  if (playBtn) playBtn.style.background = '#10A37F';
};

window.updateAudioDuration = function(playerId) {
  const audio = document.getElementById(`${playerId}-audio`);
  const timeEl = document.getElementById(`${playerId}-time`);
  if (audio && timeEl && audio.duration) {
    const duration = formatDuration(audio.duration);
    const current = formatDuration(audio.currentTime);
    timeEl.textContent = `${current} / ${duration}`;
  }
};

window.updateAudioProgress = function(playerId) {
  const audio = document.getElementById(`${playerId}-audio`);
  const timeEl = document.getElementById(`${playerId}-time`);
  const progressEl = document.getElementById(`${playerId}-progress`);
  
  if (audio && timeEl && progressEl) {
    const duration = audio.duration || 0;
    const current = audio.currentTime || 0;
    
    // 更新时间显示
    const durationStr = formatDuration(duration);
    const currentStr = formatDuration(current);
    timeEl.textContent = `${currentStr} / ${durationStr}`;
    
    // 更新进度条
    const percent = duration > 0 ? (current / duration) * 100 : 0;
    progressEl.style.width = `${percent}%`;
  }
};

/**
 * 处理消息（完整版）- 同时处理 Markdown 图片、音频文件和文件路径
 */
function processMessageFull(text, options = {}) {
  if (!text) return { text: '', filesHtml: '', imagesHtml: '', audioHtml: '' };
  
  // 1. 先处理 Markdown 图片
  const { text: textAfterImages, imagesHtml } = parseMarkdownImages(text, options);
  
  // 2. 处理音频文件
  const audioFiles = extractAudioFiles(textAfterImages);
  let textAfterAudio = textAfterImages;
  audioFiles.forEach(audioPath => {
    textAfterAudio = textAfterAudio.replace(`MEDIA:${audioPath}`, '').trim();
  });
  // 从 options 中获取 userId，如果没有则从全局 user 对象获取
  const audioOptions = { ...options };
  if (!audioOptions.userId && typeof window !== 'undefined' && window.user) {
    audioOptions.userId = window.user.id;
  }
  const audioHtml = renderAudioPlayers(audioFiles, audioOptions);
  
  // 3. 再处理文件路径
  const { text: cleanText, filesHtml } = processMessage(textAfterAudio, options);
  
  return {
    text: cleanText,
    filesHtml,
    imagesHtml,
    audioHtml
  };
}

// 挂载到 window（全局可用）
window.extractFiles = extractFiles;
window.getFileUrl = getFileUrl;
window.renderFileAttachments = renderFileAttachments;
window.processMessage = processMessage;
window.processMessageFull = processMessageFull;
window.parseMarkdownImages = parseMarkdownImages;
window.showImagePreview = showImagePreview;
