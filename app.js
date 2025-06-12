// 全局变量
let pdfFile = null;
let extractedText = '';
let textBlocks = [];
let translatedBlocks = [];
let apiKey = '';
let prompt = '';
let webUrl = '';
let sourceLanguage = 'en'; // 默认源语言为英语

// 源语言选项数据
const sourceLanguages = {
    "en": "英语",
    "ja": "日语",
    "ko": "韩语",
    "fr": "法语",
    "de": "德语",
    "ru": "俄语",
    "es": "西班牙语"
};

// 匹配中文、日文和韩文字符的正则表达式
// \u4E00-\u9FFF：中文字符
// \u3040-\u309F：日文平假名
// \u30A0-\u30FF：日文片假名
// \uAC00-\uD7A3：韩文音节
// \u1100-\u11FF：韩文字母
const cjkRegex = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7A3\u1100-\u11FF]/g;
const concurrencyLimit = 9;
const blockSize = 500;
const mode = 'production'
const apiUrl = mode === 'dev' ? 'http://localhost:8787' : 'https://worker.pdftranslate.fun';

// WebInk API URL
const webInkApiUrl = 'https://webink.app/api/markdown';
// Use a CORS proxy service
const corsProxyUrl = 'https://api.allorigins.win/raw?url=';

// url = 'https://www.anthropic.com/news/agent-capabilities-api'
// targetUrl = `${encodeURIComponent(webInkApiUrl)}?url=${encodeURIComponent(url)}`
// const corsProxyUrl = 'https://whateverorigin.org/';
// fetch(`https://whateverorigin.org/get?url=${targetUrl}`).then(response => {
//     if (response.ok) return response.json()
//     throw new Error('Network response was not ok.')
//   })
//   .then(data => console.log(data));

// 翻译块状态常量
const BLOCK_STATUS = {
    PENDING: 'pending',   // 待翻译
    TRANSLATING: 'translating', // 翻译中
    COMPLETED: 'completed',  // 翻译完成
    FAILED: 'failed'    // 翻译失败
};

// DOM元素
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const browseButton = document.getElementById('browseButton');
const progressBar = document.getElementById('progressBar');
const statusMessage = document.getElementById('statusMessage');
const progressContainer = document.getElementById('progressContainer');
const startTranslationBtn = document.getElementById('startTranslationBtn');
const translationResult = document.getElementById('translationResult');
const translatedContent = document.getElementById('translatedContent');
const apiKeyInput = document.getElementById('apiKeyInput');
const promptInput = document.getElementById('prompt');
const toggleApiKey = document.getElementById('toggleApiKey');
const downloadMarkdownBtn = document.getElementById('downloadMarkdownBtn');
const urlInput = document.getElementById('urlInput');
const clearUrlBtn = document.getElementById('clearUrl');

// 初始化事件监听器
document.addEventListener('DOMContentLoaded', () => {
    // 设置PDF.js worker路径
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

    // 从localStorage加载API密钥（如果有）
    const savedApiKey = localStorage.getItem('deepseekApiKey');
    if (savedApiKey) {
        apiKeyInput.value = savedApiKey;
        apiKey = savedApiKey;
    }
    // 从localStorage加载提示（如果有）
    const savedPrompt = localStorage.getItem('translationPrompt');
    if (savedPrompt) {
        promptInput.value = savedPrompt;
        prompt = savedPrompt;
    }

    // 设置事件监听器
    setupEventListeners();
});

// 设置所有事件监听器
function setupEventListeners() {
    // 文件上传相关事件
    fileInput.addEventListener('change', handleFileSelect);
    browseButton.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleFileDrop);

    // 初始化源语言选项
    initSourceLanguageOptions();

    // 网址输入相关事件
    urlInput.addEventListener('input', handleUrlInput);
    clearUrlBtn.addEventListener('click', () => {
        urlInput.value = '';
        webUrl = '';
        checkStartButtonState();
    });

    // 开始翻译按钮
    startTranslationBtn.addEventListener('click', startTranslation);
    // API密钥相关
    apiKeyInput.addEventListener('input', () => {
        apiKey = apiKeyInput.value.trim();
        localStorage.setItem('deepseekApiKey', apiKey);
        checkStartButtonState();
    });
    // 提示输入框
    promptInput.addEventListener('input', () => {
        prompt = promptInput.value.trim();
        localStorage.setItem('translationPrompt', prompt);
    });

    // 切换API密钥可见性
    toggleApiKey.addEventListener('click', () => {
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            toggleApiKey.innerHTML = '<i class="bi bi-eye-slash"></i>';
        } else {
            apiKeyInput.type = 'password';
            toggleApiKey.innerHTML = '<i class="bi bi-eye"></i>';
        }
    });

    // 下载Markdown按钮
    downloadMarkdownBtn.addEventListener('click', downloadTranslatedMarkdown);
}

// 处理网址输入
function handleUrlInput(event) {
    webUrl = event.target.value.trim();

    // 如果输入了网址，清空文件选择
    if (webUrl) {
        pdfFile = null;
        fileInput.value = ''; // 清空文件输入框
        extractedText = ''; // 清空已提取的文本
    }

    checkStartButtonState();
}

// 处理文件选择
function handleFileSelect(event) {
    // 重置计时器
    stopTimer();
    document.getElementById('timerDisplay').textContent = '00:00';

    const file = event.target.files[0];
    if (file && (file.type === 'application/pdf' || file.name.endsWith('.md'))) {
        pdfFile = file;
        updateStatus('文件已选择: ' + file.name, 10);
        progressContainer.classList.remove('hidden');

        // 清空网址输入框
        urlInput.value = '';
        webUrl = '';

        if (file.type === 'application/pdf') {
            extractPdfText(file);
        } else if (file.name.endsWith('.md')) {
            extractMarkdownText(file);
        }
    } else {
        alert('请选择有效的PDF或Markdown文件');
    }

    checkStartButtonState();
}

// 处理拖拽悬停
function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    uploadArea.classList.add('active');
}

// 处理拖拽离开
function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    uploadArea.classList.remove('active');
}

// 处理文件拖放
function handleFileDrop(event) {
    // 重置计时器
    stopTimer();
    document.getElementById('timerDisplay').textContent = '00:00';

    event.preventDefault();
    event.stopPropagation();
    uploadArea.classList.remove('active');

    const file = event.dataTransfer.files[0];
    if (file && (file.type === 'application/pdf' || file.name.endsWith('.md'))) {
        pdfFile = file;
        fileInput.files = event.dataTransfer.files;
        updateStatus('文件已上传: ' + file.name, 10);
        progressContainer.classList.remove('hidden');

        // 清空网址输入框
        urlInput.value = '';
        webUrl = '';

        if (file.type === 'application/pdf') {
            extractPdfText(file);
        } else if (file.name.endsWith('.md')) {
            extractMarkdownText(file);
        }
    } else {
        alert('请拖放有效的PDF或Markdown文件');
    }
    checkStartButtonState();
}

// 检查开始按钮状态
function checkStartButtonState() {
    // 如果有API密钥，并且有文件或网址，则启用开始按钮
    if (apiKey && (pdfFile || webUrl)) {
        startTranslationBtn.disabled = false;
        progressContainer.classList.remove('hidden');
    } else {
        startTranslationBtn.disabled = true;
    }
}

// 从PDF提取文本
async function extractPdfText(file) {
    updateStatus('正在解析PDF文件...', 20);

    try {
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdf.numPages;

        // 保存文件页数信息
        fileInfo = {
            fileName: file.name,
            pageCount: numPages
        };

        let text = '';

        for (let i = 1; i <= numPages; i++) {
            updateStatus(`正在提取文本 (页面 ${i}/${numPages})`, 20 + (i / numPages) * 30);
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            text += pageText + '\n\n';
        }

        // 转换为Markdown格式（简单处理）
        extractedText = convertToMarkdown(text);
        updateStatus('文本提取完成，准备翻译', 50);
        console.log('提取的文本:', extractedText.substring(0, 500) + '...');

    } catch (error) {
        console.error('PDF解析错误:', error);
        updateStatus('PDF解析失败: ' + error.message, 0);
    }
}

// 从网址获取Markdown文本
async function fetchWebContent(url) {
    updateStatus('正在从网页获取内容...', 20);

    try {
        // Construct the API request URL
        const apiRequestUrl = `${corsProxyUrl}${encodeURIComponent(webInkApiUrl)}?url=${encodeURIComponent(url)}`;
        console.log('apiRequestUrl', apiRequestUrl)

        const response = await fetch(apiRequestUrl, {
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`获取网页内容失败: ${response.status} ${response.statusText}`);
        }

        const markdown = await response.text();

        // 保存文件信息
        fileInfo = {
            fileName: `webpage_${new URL(url).hostname}`,
            fileType: 'webpage',
            sourceUrl: url
        };

        extractedText = markdown;
        updateStatus('网页内容获取完成，准备翻译', 50);
        console.log('获取的网页内容:', extractedText);

        return markdown;
    } catch (error) {
        console.error('获取网页内容错误:', error);
        updateStatus('获取网页内容失败: ' + error.message, 0);
        throw error;
    }
}

// 将文本转换为简单的Markdown格式
function convertToMarkdown(text) {
    // 这里可以添加更复杂的转换逻辑
    // 目前只是简单地处理段落
    const paragraphs = text.split(/\n\s*\n/);
    return paragraphs.map(p => p.trim()).filter(p => p).join('\n\n');
}

// 检查文本中中文、日文或韩文字符的比例是否超过阈值
function hasCJKCharactersOverThreshold(text, threshold = 0.5) {
    const cjkMatches = text.match(cjkRegex) || [];
    // 计算中日韩文字符的比例
    return cjkMatches.length / text.length > threshold;
}

// 计算中文、日文或韩文字符的数量
function countCJKCharacters(text) {
    const cjkMatches = text.match(cjkRegex) || [];
    return cjkMatches.length;
}

// 将文本分块，确保每块包含完整段落
function splitTextIntoBlocks(text, blockSize) {
    updateStatus('正在进行文本分块...', 60);

    const paragraphs = text.split(/\n\n/);
    const blocks = [];
    let currentBlock = '';
    let currentWordCount = 0;

    for (const paragraph of paragraphs) {
        // 判断段落中中文、日文或韩文字符的比例是否超过50%
        let paragraphWordCount;
        if (hasCJKCharactersOverThreshold(paragraph)) {
            // 如果中日韩文字符比例超过50%，则计算字符数
            paragraphWordCount = countCJKCharacters(paragraph);
        } else {
            // 否则按照空格分隔计算单词数
            paragraphWordCount = paragraph.split(/\s+/).length;
        }

        // 如果当前段落加上已有内容超过了块大小，并且当前块不为空，则创建新块
        if (currentWordCount + paragraphWordCount > blockSize && currentBlock !== '') {
            blocks.push(currentBlock.trim());
            currentBlock = paragraph;
            currentWordCount = paragraphWordCount;
        } else {
            // 否则，将段落添加到当前块
            if (currentBlock !== '') {
                currentBlock += '\n\n';
            }
            currentBlock += paragraph;
            currentWordCount += paragraphWordCount;
        }
    }

    // 添加最后一个块
    if (currentBlock !== '') {
        blocks.push(currentBlock.trim());
    }

    updateStatus(`文本已分为 ${blocks.length} 个块`, 70);
    return blocks;
}

// 开始翻译过程
async function startTranslation() {
    // 禁用文件上传相关的UI元素
    browseButton.disabled = true;
    uploadArea.style.pointerEvents = 'none';
    fileInput.disabled = true;
    urlInput.disabled = true;
    clearUrlBtn.disabled = true;

    if (!apiKey) {
        alert('请输入密钥');
        apiKeyInput.focus();
        return;
    }

    try {
        // 如果有网址输入，优先处理网址
        if (webUrl) {
            // 清除之前的文件选择
            pdfFile = null;
            extractedText = '';

            // 从网址获取内容
            await fetchWebContent(webUrl);
        }

        if (!extractedText) {
            alert('没有可翻译的内容。请上传文件或输入有效网址。');

            // 恢复UI元素状态
            browseButton.disabled = false;
            uploadArea.style.pointerEvents = 'auto';
            fileInput.disabled = false;
            urlInput.disabled = false;
            clearUrlBtn.disabled = false;

            return;
        }

        startTimer(); // 开始计时
        // 禁用下载按钮、禁用开始翻译按钮
        downloadMarkdownBtn.disabled = true;
        startTranslationBtn.disabled = true;

        textBlocks = splitTextIntoBlocks(extractedText, blockSize);

        // 初始化翻译块为"待翻译"状态
        translatedBlocks = textBlocks.map((text, index) => ({
            status: BLOCK_STATUS.PENDING,
            content: null,
            index: index,
            originalText: text,
            error: null
        }));

        // 更新文件信息对象，添加分块阈值和分块数
        fileInfo.blockSize = blockSize;
        fileInfo.blockCount = textBlocks.length;

        updateStatus(`开始翻译 ${textBlocks.length} 个文本块...`, 75);

        // 准备翻译结果区域
        translationResult.classList.remove('hidden');

        // 显示所有待翻译块
        updateAllTranslationBlocks();

        // 并发翻译，但限制并发数量
        const pendingBlocks = [...Array(textBlocks.length).keys()];
        const activePromises = new Set();

        while (pendingBlocks.length > 0 || activePromises.size > 0) {
            // 填充活跃请求直到达到并发限制
            while (pendingBlocks.length > 0 && activePromises.size < concurrencyLimit) {
                const blockIndex = pendingBlocks.shift();
                const promise = translateBlock(textBlocks[blockIndex], blockIndex)
                    .then(() => {
                        activePromises.delete(promise);
                    });
                activePromises.add(promise);
            }

            // 等待任意一个请求完成
            if (activePromises.size > 0) {
                await Promise.race(Array.from(activePromises));
            }
        }

        // 所有块都翻译完成后，显示最终结果
        displayTranslationResult();
    } catch (error) {
        console.error('翻译过程出错:', error);
        updateStatus('翻译过程出错: ' + error.message, 0);

        // 恢复UI元素状态
        browseButton.disabled = false;
        uploadArea.style.pointerEvents = 'auto';
        fileInput.disabled = false;
        urlInput.disabled = false;
        clearUrlBtn.disabled = false;
        startTranslationBtn.disabled = false;
    }
}

// 翻译单个文本块
async function translateBlock(text, index) {
    try {
        translatedBlocks[index].status = BLOCK_STATUS.TRANSLATING;
        updateTranslationBlock(index);

        fileInfo.progress = `${index + 1}/${textBlocks.length}`;
        const translatedText = await callDeepSeekAPI(text);

        translatedBlocks[index].status = BLOCK_STATUS.COMPLETED;
        translatedBlocks[index].content = translatedText;
        translatedBlocks[index].error = null;

        updateTranslationBlock(index);
        return translatedText;
    } catch (error) {
        console.error(`翻译块 ${index} 失败:`, error);

        translatedBlocks[index].status = BLOCK_STATUS.FAILED;
        translatedBlocks[index].error = error.message;
        translatedBlocks[index].content = `
原文:
${text}`;

        updateTranslationBlock(index);
        return translatedBlocks[index].content;
    }
}

// 调用Cloudflare Worker API进行翻译
async function callDeepSeekAPI(text) {
    const requestData = {
        key: apiKey,
        text: text,
        file_info: fileInfo,
        prompt: prompt,  // 添加prompt字段
        source_language: sourceLanguage  // 添加源语言字段
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`错误${response.status}: ${errorData.message || response.statusText}`);
        }

        // 解析Worker返回的标准OpenAI chat/completion响应JSON
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error('翻译API调用失败:', error);
        throw error;
    }
}

// 生成翻译块的HTML
function generateBlockHTML(block) {
    const { status, content, index, error } = block;

    switch (status) {
        case BLOCK_STATUS.PENDING:
            return `<div class="translation-block pending" id="block-${index}">
                <div class="block-content text-center p-3 my-3" style="background-color: #f0f0f0; border-radius: 5px;">
                    <p class="mb-0">分块 ${index + 1}：待翻译</p>
                </div>
            </div>`;

        case BLOCK_STATUS.TRANSLATING:
            return `<div class="translation-block translating" id="block-${index}">
                <div class="block-content text-center p-3 my-3" style="background-color: #e8f4ff; border-radius: 5px;">
                    <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <span>正在翻译分块 ${index + 1}...</span>
                </div>
            </div>`;

        case BLOCK_STATUS.COMPLETED:
            if (content) {
                const htmlContent = marked.parse(content);
                return `<div class="translation-block completed" id="block-${index}">
                    <div class="block-content p-3">
                        <div class="block-text">${htmlContent}</div>
                    </div>
                </div>`;
            }
            return '';

        case BLOCK_STATUS.FAILED:
            return `<div class="translation-block failed" id="block-${index}">
                <div class="block-content p-3 my-3" style="border: 1px solid #ffcccc; border-radius: 5px; background-color: #fff8f8;">
                    <div class="block-header mb-2 text-danger">
                        <strong>分块 ${index + 1}：翻译失败</strong>
                        <small class="d-block text-muted">${error}</small>
                    </div>
                    <div class="block-text">${marked.parse(content)}</div>
                </div>
            </div>`;

        default:
            return '';
    }
}

// 更新所有翻译块的显示
function updateAllTranslationBlocks() {
    // 确保翻译结果区域可见
    if (translationResult.classList.contains('hidden')) {
        translationResult.classList.remove('hidden');
    }

    const allBlocksHTML = translatedBlocks.map(block => generateBlockHTML(block)).join('');
    translatedContent.innerHTML = allBlocksHTML;

    // 分别计算成功和失败的块数
    const completedCount = translatedBlocks.filter(block => block.status === BLOCK_STATUS.COMPLETED).length;
    const failedCount = translatedBlocks.filter(block => block.status === BLOCK_STATUS.FAILED).length;
    const totalCount = textBlocks.length;
    const progress = 75 + ((completedCount + failedCount) / totalCount) * 20;

    updateStatus(`已翻译 ${completedCount}/${totalCount} 个块（${failedCount} 个失败）`, progress);
}

// 更新单个翻译块的显示
function updateTranslationBlock(index) {
    const blockElement = document.getElementById(`block-${index}`);
    if (blockElement) {
        blockElement.outerHTML = generateBlockHTML(translatedBlocks[index]);
    } else {
        // 如果元素不存在，更新所有块
        updateAllTranslationBlocks();
    }

    // 计算进度
    const completedCount = translatedBlocks.filter(block => block.status === BLOCK_STATUS.COMPLETED).length;
    const failedCount = translatedBlocks.filter(block => block.status === BLOCK_STATUS.FAILED).length;
    const totalCount = textBlocks.length;
    const progress = 75 + ((completedCount + failedCount) / totalCount) * 20;

    updateStatus(`已翻译 ${completedCount}/${totalCount} 个块（${failedCount} 个失败）`, progress);
}

// 显示最终翻译结果（所有块完成后调用）
function displayTranslationResult() {
    // 检查所有块的状态
    const completedCount = translatedBlocks.filter(block => block.status === BLOCK_STATUS.COMPLETED).length;
    const failedCount = translatedBlocks.filter(block => block.status === BLOCK_STATUS.FAILED).length;
    const totalCount = textBlocks.length;
    const allBlocksProcessed = translatedBlocks.every(block =>
        block.status === BLOCK_STATUS.COMPLETED || block.status === BLOCK_STATUS.FAILED
    );

    if (allBlocksProcessed) {
        stopTimer(); // 停止计时器
        updateStatus('翻译完成，正在生成结果...', 95);

        // 最后一次更新所有块
        updateAllTranslationBlocks();

        translationResult.classList.remove('hidden');
        updateStatus(`翻译完成（共${totalCount}个块，成功${completedCount}，失败${failedCount}）`, 100);

        // 启用下载按钮
        downloadMarkdownBtn.disabled = false;

        // 恢复文件上传相关的UI元素
        browseButton.disabled = false;
        uploadArea.style.pointerEvents = 'auto';
        startTranslationBtn.disabled = false;
        fileInput.disabled = false;

        // 恢复网址输入相关的UI元素
        urlInput.disabled = false;
        clearUrlBtn.disabled = false;
    }
}

// 下载翻译结果为Markdown文件
function downloadTranslatedMarkdown() {
    // 收集所有已翻译的文本
    const translatedText = translatedBlocks
        .filter(block => block.status === BLOCK_STATUS.COMPLETED)
        .map(block => block.content)
        .join('\n\n');

    // 获取当前时间
    const now = new Date();
    const dateTimeStr = now.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    // 创建文件头部信息
    let headerInfo = `# 文件信息\n\n`;
    headerInfo += `- 原始文件：${fileInfo.fileName}\n`;

    // 如果是网页，添加源URL
    if (fileInfo.fileType === 'webpage' && fileInfo.sourceUrl) {
        headerInfo += `- 源网址：${fileInfo.sourceUrl}\n`;
    }

    // 如果是PDF，添加页数信息
    if (fileInfo.pageCount) {
        headerInfo += `- 页数：${fileInfo.pageCount}\n`;
    }

    headerInfo += `- 翻译时间：${dateTimeStr}\n\n`;
    headerInfo += `---\n\n`; // 添加分隔线

    // 将头部信息添加到翻译文本前
    const contentWithHeader = headerInfo + translatedText;

    // 创建Blob对象
    const blob = new Blob([contentWithHeader], { type: 'text/markdown;charset=utf-8' });

    // 创建下载链接
    const downloadLink = document.createElement('a');
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = `translated_${fileInfo.fileName.replace(/\.[^/.]+$/, '')}.md`;

    // 触发下载
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    // 清理URL对象
    URL.revokeObjectURL(downloadLink.href);
}

// 更新状态和进度条
function updateStatus(message, progressPercent) {
    statusMessage.textContent = message;
    progressBar.style.width = `${progressPercent}%`;
}

// 将文件读取为ArrayBuffer
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// 从Markdown文件提取文本
async function extractMarkdownText(file) {
    updateStatus('正在读取Markdown文件...', 20);

    try {
        // 保存文件信息
        fileInfo = {
            fileName: file.name,
            fileType: 'markdown'
        };

        // 使用FileReader读取文件内容
        const text = await readFileAsText(file);

        // Markdown文件内容已经是文本格式，直接使用
        extractedText = text;
        updateStatus('文本读取完成，准备翻译', 50);
        console.log('提取的文本:', extractedText.substring(0, 500) + '...');

    } catch (error) {
        console.error('Markdown文件读取错误:', error);
        updateStatus('Markdown文件读取失败: ' + error.message, 0);
    }
}

// 将文件读取为文本
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// 计时器相关变量
let timerInterval;
let startTime;

function updateTimer() {
    const currentTime = Date.now();
    const elapsedTime = Math.floor((currentTime - startTime) / 1000);
    const minutes = Math.floor(elapsedTime / 60);
    const seconds = elapsedTime % 60;
    document.getElementById('timerDisplay').textContent =
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function startTimer() {
    startTime = Date.now();
    timerInterval = setInterval(updateTimer, 1000);
    document.getElementById('timerIcon').classList.add('rotate-animation');
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        document.getElementById('timerIcon').classList.remove('rotate-animation');
    }
}

// 添加时钟图标旋转动画样式
const style = document.createElement('style');
style.textContent = `
    @keyframes rotate {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    .rotate-animation {
        animation: rotate 2s linear infinite;
    }
`;
document.head.appendChild(style);

// 在文档加载完成后的初始化函数中添加
document.getElementById('advancedSettingsToggle').addEventListener('click', function (e) {
    e.preventDefault();
    const panel = document.getElementById('advancedSettingsPanel');
    panel.classList.toggle('hidden');

    // 更新图标和文本
    const icon = this.querySelector('i');
    if (panel.classList.contains('hidden')) {
        icon.className = 'bi bi-gear-fill me-1';
        this.innerHTML = '<i class="bi bi-gear-fill me-1"></i>进阶设置';
    } else {
        icon.className = 'bi bi-gear-fill me-1';
        this.innerHTML = '<i class="bi bi-gear-fill me-1"></i>收起进阶设置';
    }
});

// 初始化源语言选项
function initSourceLanguageOptions() {
    const container = document.getElementById('sourceLanguageOptions');
    container.innerHTML = '';

    Object.entries(sourceLanguages).forEach(([code, name], index) => {
        const radioId = `lang-${code}`;

        const radioDiv = document.createElement('div');
        radioDiv.className = 'form-check form-check-inline';

        const radioInput = document.createElement('input');
        radioInput.className = 'form-check-input';
        radioInput.type = 'radio';
        radioInput.name = 'sourceLanguage';
        radioInput.id = radioId;
        radioInput.value = code;
        radioInput.checked = code === 'en'; // 默认选中英语

        radioInput.addEventListener('change', () => {
            if (radioInput.checked) {
                sourceLanguage = code;
                checkStartButtonState();
            }
        });

        const radioLabel = document.createElement('label');
        radioLabel.className = 'form-check-label';
        radioLabel.htmlFor = radioId;
        radioLabel.textContent = name;

        radioDiv.appendChild(radioInput);
        radioDiv.appendChild(radioLabel);
        container.appendChild(radioDiv);
    });
}