// 全局变量
let pdfFile = null;
let extractedText = '';
let textBlocks = [];
let translatedBlocks = [];
let apiKey = '';

// DOM元素
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const browseButton = document.getElementById('browseButton');
const progressBar = document.getElementById('progressBar');
const statusMessage = document.getElementById('statusMessage');
const progressContainer = document.getElementById('progressContainer');
const startTranslationBtn = document.getElementById('startTranslationBtn');
const blockSizeInput = document.getElementById('blockSizeInput');
const translationResult = document.getElementById('translationResult');
const translatedContent = document.getElementById('translatedContent');
const loadingResult = document.getElementById('loadingResult');
const apiKeyInput = document.getElementById('apiKeyInput');
const toggleApiKey = document.getElementById('toggleApiKey');

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
    
    // 开始翻译按钮
    startTranslationBtn.addEventListener('click', startTranslation);
    
    // API密钥相关
    apiKeyInput.addEventListener('input', () => {
        apiKey = apiKeyInput.value.trim();
        localStorage.setItem('deepseekApiKey', apiKey);
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
}

// 处理文件选择
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
        pdfFile = file;
        updateStatus('文件已选择: ' + file.name, 10);
        progressContainer.classList.remove('hidden');
        startTranslationBtn.classList.remove('hidden');
        extractPdfText(file);
    } else {
        alert('请选择有效的PDF文件');
    }
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
    event.preventDefault();
    event.stopPropagation();
    uploadArea.classList.remove('active');
    
    const file = event.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
        pdfFile = file;
        fileInput.files = event.dataTransfer.files;
        updateStatus('文件已上传: ' + file.name, 10);
        progressContainer.classList.remove('hidden');
        startTranslationBtn.classList.remove('hidden');
        extractPdfText(file);
    } else {
        alert('请拖放有效的PDF文件');
    }
}

// 全局变量用于存储PDF文件信息
let fileInfo = null;

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

// 将文本转换为简单的Markdown格式
function convertToMarkdown(text) {
    // 这里可以添加更复杂的转换逻辑
    // 目前只是简单地处理段落
    const paragraphs = text.split(/\n\s*\n/);
    return paragraphs.map(p => p.trim()).filter(p => p).join('\n\n');
}

// 将文本分块，确保每块包含完整段落
function splitTextIntoBlocks(text, blockSize) {
    updateStatus('正在进行文本分块...', 60);
    
    const paragraphs = text.split(/\n\n/);
    const blocks = [];
    let currentBlock = '';
    let currentWordCount = 0;
    
    for (const paragraph of paragraphs) {
        const paragraphWordCount = paragraph.split(/\s+/).length;
        
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
    if (!extractedText) {
        alert('请先上传并处理PDF文件');
        return;
    }
    
    if (!apiKey) {
        alert('请输入API密钥');
        apiKeyInput.focus();
        return;
    }
    
    const blockSize = parseInt(blockSizeInput.value) || 300;
    textBlocks = splitTextIntoBlocks(extractedText, blockSize);
    translatedBlocks = new Array(textBlocks.length).fill(null);
    
    // 更新文件信息对象，添加分块阈值和分块数
    fileInfo.blockSize = blockSize;
    fileInfo.blockCount = textBlocks.length;
    
    updateStatus(`开始翻译 ${textBlocks.length} 个文本块...`, 75);
    loadingResult.classList.remove('hidden');
    
    // 并发翻译，但限制并发数量
    const concurrencyLimit = 3; // 同时最多发送3个请求
    const pendingBlocks = [...Array(textBlocks.length).keys()];
    const activePromises = new Set();
    
    while (pendingBlocks.length > 0 || activePromises.size > 0) {
        // 填充活跃请求直到达到并发限制
        while (pendingBlocks.length > 0 && activePromises.size < concurrencyLimit) {
            const blockIndex = pendingBlocks.shift();
            const promise = translateBlock(textBlocks[blockIndex], blockIndex)
                .then(() => {
                    activePromises.delete(promise);
                    const progress = 75 + (translatedBlocks.filter(b => b !== null).length / textBlocks.length) * 20;
                    updateStatus(`已翻译 ${translatedBlocks.filter(b => b !== null).length}/${textBlocks.length} 个块`, progress);
                });
            activePromises.add(promise);
        }
        
        // 等待任意一个请求完成
        if (activePromises.size > 0) {
            await Promise.race(Array.from(activePromises));
        }
    }
    
    // 所有块都翻译完成后，显示结果
    displayTranslationResult();
}

// 翻译单个文本块
async function translateBlock(text, index) {
    try {
        const translatedText = await callDeepSeekAPI(text);
        translatedBlocks[index] = translatedText;
        return translatedText;
    } catch (error) {
        console.error(`翻译块 ${index} 失败:`, error);
        // 重试逻辑可以在这里添加
        translatedBlocks[index] = `[翻译失败: ${error.message}]\n\n${text}`;
        return translatedBlocks[index];
    }
}

// 调用Cloudflare Worker API进行翻译
async function callDeepSeekAPI(text) {
    const apiUrl = 'https://pdftranslate.lisongfeng.workers.dev';
    
    // 更新请求体，添加file_info字段
    const requestData = {
        key: apiKey, // 可以是简单字符串或真正的Deepseek API key
        text: text,
        file_info: fileInfo
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
            throw new Error(`API错误: ${errorData.error?.message || response.statusText}`);
        }
        
        // 解析Worker返回的标准OpenAI chat/completion响应JSON
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error('翻译API调用失败:', error);
        throw error;
    }
}

// 显示翻译结果
function displayTranslationResult() {
    updateStatus('翻译完成，正在生成结果...', 95);
    loadingResult.classList.add('hidden');
    
    // 合并所有翻译块
    const fullTranslation = translatedBlocks.join('\n\n');
    
    // 将Markdown转换为HTML
    const htmlContent = marked.parse(fullTranslation);
    translatedContent.innerHTML = htmlContent;
    
    translationResult.classList.remove('hidden');
    updateStatus('翻译完成！', 100);
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