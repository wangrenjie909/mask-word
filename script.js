// ============================================
// 文字遮罩效果生成器 - Web版
// 移植自 text_mask_qt.py
// ============================================

// ---- DOM 引用 ----
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const fileInput = $('#file-input');
const btnSelectImage = $('#btn-select-image');
const imageInfo = $('#image-info');
const textInput = $('#text-input');
const fontSizeSlider = $('#font-size-slider');
const fontSizeValue = $('#font-size-value');
const strokeSlider = $('#stroke-slider');
const strokeValue = $('#stroke-value');
const directionRadios = $$('input[name="direction"]');
const positionCheck = $('#position-check');
const xSlider = $('#x-slider');
const ySlider = $('#y-slider');
const xValue = $('#x-value');
const yValue = $('#y-value');
const btnCenter = $('#btn-center');
const btnGenerate = $('#btn-generate');
const btnSave = $('#btn-save');
const previewCanvas = $('#preview-canvas');
const placeholder = $('#placeholder');
const statusBar = $('#status-bar');

// ---- 状态变量 ----
let originalImage = null;        // HTMLImageElement
let resultImageData = null;      // ImageData (生成的结果)
let needRegenerate = false;      // 标记是否需要重新生成

// ---- 工具函数 ----
function showStatus(msg) {
  statusBar.textContent = msg;
  statusBar.style.display = 'block';
}

function hideStatus() {
  statusBar.style.display = 'none';
}

// ---- 图片选择 ----
btnSelectImage.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const img = new Image();
  img.onload = () => {
    originalImage = img;
    imageInfo.textContent = `${file.name} (${img.width} × ${img.height})`;

    // 更新 XY 滑块范围
    const range = Math.max(200, Math.floor(Math.max(img.width, img.height) / 2));
    xSlider.min = -range;
    xSlider.max = range;
    ySlider.min = -range;
    ySlider.max = range;

    showStatus(`已加载: ${file.name} | 尺寸: ${img.width} × ${img.height}`);
    needRegenerate = true;
    generateTextMask();
  };
  img.onerror = () => {
    alert('无法加载图片，请检查文件格式。');
  };
  img.src = URL.createObjectURL(file);

  // 重置 input 以便重复选择同一文件
  fileInput.value = '';
});

// ---- 文字输入 ----
textInput.addEventListener('input', () => {
  scheduleGenerate();
});

// ---- 字体大小 ----
fontSizeSlider.addEventListener('input', () => {
  fontSizeValue.textContent = fontSizeSlider.value;
  scheduleGenerate();
});

// ---- 描边宽度 ----
strokeSlider.addEventListener('input', () => {
  strokeValue.textContent = strokeSlider.value;
  scheduleGenerate();
});

// ---- 文字方向 ----
directionRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    if (radio.checked) scheduleGenerate();
  });
});

// ---- 自定义位置 ----
positionCheck.addEventListener('change', () => {
  const enabled = positionCheck.checked;
  xSlider.disabled = !enabled;
  ySlider.disabled = !enabled;
  btnCenter.disabled = !enabled;

  if (!enabled) {
    xSlider.value = 0;
    ySlider.value = 0;
    xValue.textContent = '0';
    yValue.textContent = '0';
  }
  scheduleGenerate();
});

xSlider.addEventListener('input', () => {
  xValue.textContent = xSlider.value;
  if (positionCheck.checked) scheduleGenerate();
});

ySlider.addEventListener('input', () => {
  yValue.textContent = ySlider.value;
  if (positionCheck.checked) scheduleGenerate();
});

// ---- 居中按钮 ----
btnCenter.addEventListener('click', () => {
  xSlider.value = 0;
  ySlider.value = 0;
  xValue.textContent = '0';
  yValue.textContent = '0';
  scheduleGenerate();
  showStatus('已居中');
  setTimeout(hideStatus, 1500);
});

// ---- 生成按钮 ----
btnGenerate.addEventListener('click', generateTextMask);

// ---- 保存图片 ----
btnSave.addEventListener('click', saveImage);

// ---- 防抖调度（滑块/文字变化时自动生成，而非每帧触发） ----
let generateTimer = null;

function scheduleGenerate() {
  if (!originalImage) return;
  clearTimeout(generateTimer);
  generateTimer = setTimeout(generateTextMask, 150);
}

// ============================================
// 核心：文字遮罩生成
// ============================================
function generateTextMask() {
  if (!originalImage) {
    placeholder.style.display = 'block';
    previewCanvas.style.display = 'none';
    return;
  }

  const text = textInput.value.trim();
  if (!text) {
    placeholder.textContent = '请输入文字';
    placeholder.style.display = 'block';
    previewCanvas.style.display = 'none';
    btnSave.disabled = true;
    return;
  }

  const img = originalImage;
  const w = img.width;
  const h = img.height;
  const fontSize = parseInt(fontSizeSlider.value, 10);
  const strokeWidth = parseInt(strokeSlider.value, 10);
  const isVertical = document.querySelector('input[name="direction"]:checked').value === 'vertical';
  const useCustomPos = positionCheck.checked;
  const offsetX = parseInt(xSlider.value, 10);
  const offsetY = parseInt(ySlider.value, 10);

  // ---- 创建离屏画布（主结果） ----
  const mainCanvas = document.createElement('canvas');
  mainCanvas.width = w;
  mainCanvas.height = h;
  const ctx = mainCanvas.getContext('2d');

  // 先填充纯黑背景
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  // ---- 创建遮罩画布（白色文字, 透明背景） ----
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext('2d');

  // 尝试使用中文字体
  const fontFamily = getFontFamily();
  maskCtx.font = `${fontSize}px ${fontFamily}`;
  maskCtx.textBaseline = 'top';

  // ---- 计算文字位置并绘制 ----
  if (isVertical) {
    // --- 竖向文字 ---
    const charHeight = fontSize;
    const totalHeight = text.length * charHeight;

    let baseX, baseY;
    if (useCustomPos) {
      baseX = Math.floor((w - fontSize) / 2 + offsetX);
      baseY = Math.floor((h - totalHeight) / 2 + offsetY);
    } else {
      baseX = Math.floor((w - fontSize) / 2);
      baseY = Math.floor((h - totalHeight) / 2);
    }

    maskCtx.textAlign = 'center';

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const cx = baseX + fontSize / 2;
      const cy = baseY + i * charHeight;

      if (strokeWidth > 0) {
        maskCtx.strokeStyle = '#ffffff';
        maskCtx.lineWidth = strokeWidth * 2;
        maskCtx.lineJoin = 'round';
        maskCtx.strokeText(char, cx, cy);
      }
      maskCtx.fillStyle = '#ffffff';
      maskCtx.fillText(char, cx, cy);
    }
  } else {
    // --- 横向文字 ---
    maskCtx.textAlign = 'left';

    // 用 measureText 测宽
    const metrics = maskCtx.measureText(text);
    // 对于中文字体，measureText 可能不精确，我们加上额外余量
    const textWidth = metrics.width;
    const textHeight = fontSize * 1.2; // 近似行高

    let baseX, baseY;
    if (useCustomPos) {
      baseX = Math.floor((w - textWidth) / 2 + offsetX);
      baseY = Math.floor((h - textHeight) / 2 + offsetY);
    } else {
      baseX = Math.floor((w - textWidth) / 2);
      baseY = Math.floor((h - textHeight) / 2);
    }

    if (strokeWidth > 0) {
      maskCtx.strokeStyle = '#ffffff';
      maskCtx.lineWidth = strokeWidth * 2;
      maskCtx.lineJoin = 'round';
      maskCtx.strokeText(text, baseX, baseY);
    }
    maskCtx.fillStyle = '#ffffff';
    maskCtx.fillText(text, baseX, baseY);
  }

  // ---- 用遮罩合成最终结果 ----
  // 先把原图绘到主画布
  ctx.drawImage(img, 0, 0, w, h);

  // destination-in: 仅保留原图中与遮罩（不透明区域）重叠的部分
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  // ---- 保存结果并预览 ----
  resultImageData = mainCanvas;

  // 显示到预览
  previewCanvas.width = w;
  previewCanvas.height = h;
  const previewCtx = previewCanvas.getContext('2d');
  previewCtx.drawImage(mainCanvas, 0, 0);

  // 缩放显示
  fitCanvasToContainer();

  placeholder.style.display = 'none';
  previewCanvas.style.display = 'block';
  btnSave.disabled = false;

  const dirLabel = isVertical ? '竖向' : '横向';
  showStatus(`效果生成成功 | 字号: ${fontSize} | 描边: ${strokeWidth} | 方向: ${dirLabel}`);
  setTimeout(hideStatus, 3000);
}

// ---- 自适应缩放显示 ----
function fitCanvasToContainer() {
  const container = previewCanvas.parentElement;
  const containerW = container.clientWidth - 40;
  const containerH = container.clientHeight - 40;

  if (containerW <= 0 || containerH <= 0) return;

  const cw = previewCanvas.width;
  const ch = previewCanvas.height;
  const scale = Math.min(containerW / cw, containerH / ch, 1);

  previewCanvas.style.width = Math.floor(cw * scale) + 'px';
  previewCanvas.style.height = Math.floor(ch * scale) + 'px';
}

window.addEventListener('resize', () => {
  if (previewCanvas.style.display !== 'none') {
    fitCanvasToContainer();
  }
});

// ---- 获取字体（优先中文字体） ----
function getFontFamily() {
  // 系统常见中文字体回退链
  const families = [
    '"Microsoft YaHei"',
    '"微软雅黑"',
    '"PingFang SC"',
    '"Noto Sans SC"',
    '"SimHei"',
    '"黑体"',
    '"STKaiti"',
    '"KaiTi"',
    '"SimSun"',
    '"宋体"',
    'sans-serif',
  ];
  return families.join(', ');
}

// ============================================
// 保存图片
// ============================================
function saveImage() {
  if (!resultImageData) return;

  // 转换 canvas 为 blob 并下载
  resultImageData.toBlob((blob) => {
    if (!blob) {
      alert('保存失败，请重试。');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `text_mask_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showStatus('图片已保存');
    setTimeout(hideStatus, 2000);
  }, 'image/png');
}

// ============================================
// 键盘快捷键
// ============================================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target === textInput) {
    e.preventDefault();
    generateTextMask();
  }
});

// ============================================
// 初始化提示
// ============================================
console.log('文字遮罩效果生成器 (Web版) 已加载');
