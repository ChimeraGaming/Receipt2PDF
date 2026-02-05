// ============================================================================
// Receipt2PDF - app.js
// Single-file app: local OCR (Tesseract) + optional Hugging Face & OCR.Space integrations.
// Keys are read from (in order): window.RECEIPT2PDF_CONFIG (config.js) -> localStorage -> input fields.
// Local-only key names: receipt2pdf_hf_key, receipt2pdf_ocr_key
// ============================================================================

// -----------------------------
// DOM references
// -----------------------------
const uploadInput = document.getElementById('uploadInput');
const previewImg = document.getElementById('previewImg');
const printImg = document.getElementById('printImg');
const imagePreview = document.getElementById('imagePreview');
const receiptOutput = document.getElementById('receiptOutput');
const receiptContainer = document.getElementById('receiptContainer');
const printImageContainer = document.getElementById('printImageContainer');
const printBtn = document.getElementById('printBtn');
const statusDiv = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');

const includeImageToggle = document.getElementById('includeImageToggle');

const aiSection = document.getElementById('aiSection');
const aiProvider = document.getElementById('aiProvider');
const hfKeyInput = document.getElementById('hfKey');
const hfGetBtn = document.getElementById('hfGetBtn');
const hfSaveBtn = document.getElementById('hfSaveBtn');
const hfClearBtn = document.getElementById('hfClearBtn');
const hfPromptDiv = document.getElementById('hfPrompt');

const ocrKeyInput = document.getElementById('ocrKey');
const ocrGetBtn = document.getElementById('ocrGetBtn');
const ocrSaveBtn = document.getElementById('ocrSaveBtn');
const ocrClearBtn = document.getElementById('ocrClearBtn');
const ocrPromptDiv = document.getElementById('ocrPrompt');

const aiApplyBtn = document.getElementById('aiApplyBtn');
const aiStatus = document.getElementById('aiStatus');

let lastOCRText = '';
let lastUploadedFile = null;

// Read keys helper (prefer config.js window object, then localStorage, then input)
function getHuggingFaceKey() {
  return (window.RECEIPT2PDF_CONFIG && window.RECEIPT2PDF_CONFIG.HUGGING_FACE_KEY) ||
         localStorage.getItem('receipt2pdf_hf_key') ||
         (hfKeyInput ? hfKeyInput.value.trim() : '');
}
function getOCRSpaceKey() {
  return (window.RECEIPT2PDF_CONFIG && window.RECEIPT2PDF_CONFIG.OCRSPACE_KEY) ||
         localStorage.getItem('receipt2pdf_ocr_key') ||
         (ocrKeyInput ? ocrKeyInput.value.trim() : '');
}

// -----------------------------
// Event wiring
// -----------------------------
uploadInput.addEventListener('change', handleFileUpload);
printBtn.addEventListener('click', handlePrint);
includeImageToggle.addEventListener('change', handleToggleChange);

hfGetBtn.addEventListener('click', () => { window.open('https://huggingface.co/settings/tokens', '_blank', 'noopener'); hfPromptDiv.style.display = 'block'; hfKeyInput.focus(); });
hfSaveBtn.addEventListener('click', () => { const k = hfKeyInput.value.trim(); if (!k) return alert('Paste your Hugging Face key before saving.'); localStorage.setItem('receipt2pdf_hf_key', k); aiStatus.textContent = 'Hugging Face key saved locally.'; setTimeout(()=>aiStatus.textContent='',2000); });
hfClearBtn.addEventListener('click', () => { localStorage.removeItem('receipt2pdf_hf_key'); hfKeyInput.value = ''; aiStatus.textContent='HF key cleared'; setTimeout(()=>aiStatus.textContent='',2000); });

ocrGetBtn.addEventListener('click', () => { window.open('https://ocr.space/ocrapi', '_blank', 'noopener'); ocrPromptDiv.style.display = 'block'; ocrKeyInput.focus(); });
ocrSaveBtn.addEventListener('click', () => { const k = ocrKeyInput.value.trim(); if (!k) return alert('Paste your OCR.Space key before saving.'); localStorage.setItem('receipt2pdf_ocr_key', k); aiStatus.textContent = 'OCR.Space key saved locally.'; setTimeout(()=>aiStatus.textContent='',2000); });
ocrClearBtn.addEventListener('click', () => { localStorage.removeItem('receipt2pdf_ocr_key'); ocrKeyInput.value = ''; aiStatus.textContent='OCR.Space key cleared'; setTimeout(()=>aiStatus.textContent='',2000); });

aiApplyBtn.addEventListener('click', applyAICorrection);

// Pre-fill inputs from localStorage on load
document.addEventListener('DOMContentLoaded', () => {
  hfKeyInput.value = localStorage.getItem('receipt2pdf_hf_key') || '';
  ocrKeyInput.value = localStorage.getItem('receipt2pdf_ocr_key') || '';
});

// -----------------------------
// Print & toggle helpers
// -----------------------------
function handleToggleChange() {
  if (includeImageToggle.checked) document.body.classList.add('include-image-print');
  else document.body.classList.remove('include-image-print');
}
function handlePrint() {
  handleToggleChange();
  window.print();
}

// -----------------------------
// Image preprocessing
// -----------------------------
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function preprocessImageDataURL(dataURL, maxWidth = 1600) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      let imgData = ctx.getImageData(0, 0, w, h);
      let d = imgData.data;

      // grayscale + contrast bump
      for (let i = 0; i < d.length; i += 4) {
        let gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        gray = (gray - 128) * 1.25 + 128;
        d[i] = d[i + 1] = d[i + 2] = gray;
      }
      ctx.putImageData(imgData, 0, 0);

      // simple global threshold
      imgData = ctx.getImageData(0, 0, w, h);
      d = imgData.data;
      let sum = 0, count = 0;
      for (let i = 0; i < d.length; i += 4) { sum += d[i]; count++; }
      const avg = sum / count;
      const threshold = Math.max(100, Math.min(160, avg - 10));

      for (let i = 0; i < d.length; i += 4) {
        const v = d[i] > threshold ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      ctx.putImageData(imgData, 0, 0);

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataURL);
    img.src = dataURL;
  });
}

// -----------------------------
// Local OCR (Tesseract)
 // -----------------------------
async function runLocalOCR(file) {
  const dataURL = await fileToDataURL(file);
  const processed = await preprocessImageDataURL(dataURL);

  const worker = await Tesseract.createWorker({
    logger: (m) => {
      if (m.status === 'recognizing text') {
        const progress = Math.round(m.progress * 100);
        if (progressFill) {
          progressFill.style.width = progress + '%';
          progressFill.textContent = progress + '%';
        }
      }
    }
  });

  await worker.loadLanguage('eng');
  await worker.initialize('eng');
  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.AUTO,
    tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$.,:-/ %'
  });

  const { data: { text } } = await worker.recognize(processed);
  await worker.terminate();
  return text;
}

// -----------------------------
// Lightweight correction helpers (small dictionary + levenshtein)
// -----------------------------
const DICTIONARY = [
  { w: 'safeway', f: 100 }, { w: 'fiber', f: 60 }, { w: 'one', f: 55 },
  { w: 'zesty', f: 20 }, { w: 'dill', f: 20 }, { w: 'pasta', f: 70 },
  { w: 'sauce', f: 70 }, { w: 'muffin', f: 18 }, { w: 'mix', f: 40 },
  { w: 'bread', f: 60 }, { w: 'ham', f: 60 }, { w: 'smoked', f: 30 },
  { w: 'orange', f: 80 }, { w: 'navel', f: 20 }, { w: 'broccoli', f: 30 },
  { w: 'lettuce', f: 30 }, { w: 'spinach', f: 20 }, { w: 'pepper', f: 25 },
  { w: 'cheese', f: 50 }, { w: 'butter', f: 45 }, { w: 'milk', f: 80 },
  { w: 'almond', f: 30 }, { w: 'silk', f: 10 }, { w: 'yellow', f: 15 },
  { w: 'tail', f: 10 }, { w: 'wine', f: 40 }, { w: 'bag', f: 30 },
  { w: 'chips', f: 35 }, { w: 'matinee', f: 4 }, { w: 'lb', f: 40 },
  { w: 'oz', f: 20 }
];

function levenshteinDistance(a, b) {
  const an = a ? a.length : 0, bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = Array.from({ length: bn + 1 }, (_, i) => new Array(an + 1).fill(0));
  for (let i = 0; i <= bn; i++) matrix[i][0] = i;
  for (let j = 0; j <= an; j++) matrix[0][j] = j;
  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[bn][an];
}

function bestCorrection(token) {
  if (!token || token.length <= 1) return token;
  const t = token.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!t) return token;
  for (const e of DICTIONARY) if (e.w === t) return e.w;
  let best = { word: token, dist: Infinity, freq: 0 };
  for (const entry of DICTIONARY) {
    const d = levenshteinDistance(t, entry.w);
    if (d <= 2 && (d < best.dist || (d === best.dist && entry.f > best.freq))) {
      best = { word: entry.w, dist: d, freq: entry.f };
    }
  }
  return best.dist === Infinity ? token : best.word;
}

function correctLineTokens(line) {
  return line.split(/\s+/).map(token => {
    if (/^\$?\d+(\.\d{2})?$/.test(token.replace(/[,]/g, ''))) return token;
    if (token.length <= 2) return token;
    const cleaned = token.replace(/[^\w\-]/g, '');
    const corrected = bestCorrection(cleaned);
    return corrected;
  }).join(' ');
}

// -----------------------------
// Parsing heuristics
// -----------------------------
function cleanForMatching(s) {
  return s.replace(/[\*\#\@\!\^\&\(\)\[\]\{\}\<\>\~\`\|\=\+\_]/g, ' ')
          .replace(/\s+/g, ' ').trim().toLowerCase();
}

function parseReceiptText(text) {
  const rawLines = text.split('\n');
  const lines = rawLines
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map(l => {
      let cl = l.replace(/\s+/g, ' ');
      cl = cl.replace(/[\u200B-\u200D\uFEFF]/g, '');
      const corrected = correctLineTokens(cl);
      return corrected;
    });

  const receiptData = { merchant: '', date: '', items: [], subtotal: '', tax: '', total: '' };

  const datePattern = /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})|(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/;
  const pricePattern = /\$?\s*\d+(?:\.\d{2})/g;

  if (lines.length > 0) receiptData.merchant = lines[0].replace(/\s{2,}/g, ' ').trim();

  for (let line of lines) {
    const m = line.match(datePattern);
    if (m) { receiptData.date = m[0]; break; }
  }

  let inTotalsSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cleaned = cleanForMatching(line);
    const prices = line.match(pricePattern);
    if (!prices) continue;

    if (/\*+\s*(balance|total|amount)/i.test(line) || cleaned.includes('*** balance') || cleaned.includes('balance')) {
      receiptData.total = prices[prices.length - 1];
      inTotalsSection = true;
      continue;
    }

    if (['total', 'balance', 'amount', 'due'].some(k => cleaned.includes(k))) {
      receiptData.total = prices[prices.length - 1];
      inTotalsSection = true;
      continue;
    }

    if (['tax', 'hst', 'gst', 'vat', 'pst'].some(k => cleaned.includes(k))) {
      receiptData.tax = prices[prices.length - 1];
      inTotalsSection = true;
      continue;
    }

    if (['subtotal', 'sub-total', 'sub total'].some(k => cleaned.includes(k))) {
      receiptData.subtotal = prices[prices.length - 1];
      inTotalsSection = true;
      continue;
    }

    if (!inTotalsSection) {
      const priceStr = prices[prices.length - 1];
      const itemName = line.replace(priceStr, '').trim();
      if (itemName.length >= 3) {
        receiptData.items.push({ name: itemName, price: priceStr });
      }
    }
  }

  if (!receiptData.total) {
    let maxPrice = 0;
    let maxPriceStr = '';
    for (let i = Math.max(0, lines.length - 12); i < lines.length; i++) {
      const prices = lines[i].match(pricePattern);
      if (prices) {
        for (let priceStr of prices) {
          const priceVal = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
          if (priceVal > maxPrice) {
            maxPrice = priceVal;
            maxPriceStr = priceStr;
          }
        }
      }
    }
    if (maxPrice > 0) receiptData.total = maxPriceStr;
  }

  receiptData.subtotal = formatPrice(receiptData.subtotal);
  receiptData.tax = formatPrice(receiptData.tax);
  receiptData.total = formatPrice(receiptData.total);

  receiptData.items = receiptData.items.map(item => ({ name: item.name, price: formatPrice(item.price) }));

  return receiptData;
}

// -----------------------------
// Helpers
// -----------------------------
function formatPrice(p) {
  if (!p) return '$0.00';
  const cleaned = ('' + p).replace(/[^\d.]/g, '');
  const n = parseFloat(cleaned);
  if (isNaN(n)) return '$0.00';
  return '$' + n.toFixed(2);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// -----------------------------
// Rendering
// -----------------------------
function renderReceipt(data) {
  const merchant = data.merchant || 'Store Name';
  const date = data.date || new Date().toLocaleDateString();

  let itemsHTML = '';
  if (data.items.length > 0) {
    itemsHTML = data.items.map(item => `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td class="price">${escapeHtml(item.price)}</td>
      </tr>
    `).join('');
  } else {
    itemsHTML = `<tr><td>No items detected</td><td class="price">$0.00</td></tr>`;
  }

  receiptOutput.innerHTML = `
    <h2>${escapeHtml(merchant)}</h2>
    <p class="date">Date: ${escapeHtml(date)}</p>

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th style="text-align: right;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHTML}
      </tbody>
    </table>

    <div class="totals">
      <p><span>Subtotal:</span><span>${escapeHtml(data.subtotal)}</span></p>
      <p><span>Tax:</span><span>${escapeHtml(data.tax)}</span></p>
      <p class="total"><span>Total:</span><span>${escapeHtml(data.total)}</span></p>
    </div>
  `;

  // Show controls now that there is output
  receiptContainer.style.display = 'block';
  aiSection.style.display = 'block';
  document.getElementById('toggleSection').style.display = 'block';
  printBtn.style.display = 'block';
}

// -----------------------------
// File upload handler
// -----------------------------
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  lastUploadedFile = file;

  // preview original
  const dataURL = await fileToDataURL(file);
  previewImg.src = dataURL;
  printImg.src = dataURL;
  imagePreview.style.display = 'block';

  statusDiv.textContent = 'Processing image with local OCR...';
  progressBar.style.display = 'block';
  if (progressFill) { progressFill.style.width = '0%'; progressFill.textContent = '0%'; }

  try {
    const text = await runLocalOCR(file);
    lastOCRText = text;
    statusDiv.textContent = 'OCR Complete. Parsing...';
    const receiptData = parseReceiptText(text);
    renderReceipt(receiptData);
    statusDiv.textContent = 'Done. You may optionally apply AI corrections.';
    progressBar.style.display = 'none';
  } catch (err) {
    console.error(err);
    statusDiv.textContent = 'Error processing image. Please try again.';
    progressBar.style.display = 'none';
  }
}

// -----------------------------
// AI helpers: Hugging Face & OCR.Space
// -----------------------------
async function callHuggingFaceCorrection(ocrText, apiKey, model = 'google/flan-t5-small') {
  const prompt = `You are given OCR-extracted text from a grocery receipt. Correct OCR mistakes and return ONLY valid JSON with fields:
{
  "merchant": "",
  "date": "",
  "items": [{"name":"", "price":""}],
  "subtotal": "",
  "tax": "",
  "total": ""
}
If a field is unknown, use an empty string or empty array. Use $ for prices. OCR TEXT:
"""${ocrText.replace(/`/g, "'")}"""`;

  const body = JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 512 } });

  const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Hugging Face error: ' + res.status + ' ' + txt);
  }

  const json = await res.json();
  if (Array.isArray(json) && json[0] && json[0].generated_text) return json[0].generated_text;
  if (json.generated_text) return json.generated_text;
  if (typeof json === 'string') return json;
  return JSON.stringify(json);
}

async function callOCRSpace(file, apiKey) {
  const form = new FormData();
  form.append('apikey', apiKey);
  form.append('language', 'eng');
  form.append('isOverlayRequired', 'false');
  form.append('file', file);

  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    body: form
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error('OCR.Space error: ' + res.status + ' ' + txt);
  }

  const data = await res.json();
  if (data && data.ParsedResults && data.ParsedResults[0]) {
    return data.ParsedResults[0].ParsedText || '';
  }
  return '';
}

// -----------------------------
// Handle AI apply
// -----------------------------
async function applyAICorrection() {
  const provider = aiProvider.value;
  const hfKey = getHuggingFaceKey();
  const ocrKey = getOCRSpaceKey();

  if (provider === 'hf' && !hfKey) { alert('No Hugging Face key found. Use Get HF Key and Save.'); return; }
  if (provider === 'ocrspace' && !ocrKey) { alert('No OCR.Space key found. Use Get OCR Key and Save.'); return; }
  if (!lastOCRText && !lastUploadedFile) { alert('Upload a receipt first.'); return; }

  aiApplyBtn.disabled = true;
  aiApplyBtn.textContent = 'Working...';
  aiStatus.textContent = '';

  try {
    if (provider === 'hf') {
      const output = await callHuggingFaceCorrection(lastOCRText, hfKey);
      handleCorrectedTextFromHF(output);
      aiStatus.textContent = 'Hugging Face correction applied';
    } else {
      const parsed = await callOCRSpace(lastUploadedFile, ocrKey);
      lastOCRText = parsed;
      const receiptData = parseReceiptText(parsed);
      renderReceipt(receiptData);
      aiStatus.textContent = 'OCR.Space OCR applied';
    }
  } catch (err) {
    console.error(err);
    aiStatus.textContent = 'AI call failed: ' + (err.message || err);
    alert('AI call failed: ' + (err.message || err));
  } finally {
    aiApplyBtn.disabled = false;
    aiApplyBtn.textContent = 'Apply AI Correction';
    setTimeout(() => { aiStatus.textContent = ''; }, 4000);
  }
}

// -----------------------------
// Parse HF output and render (or fallback)
// -----------------------------
function handleCorrectedTextFromHF(outputText) {
  let jsonText = outputText.trim();
  const start = jsonText.indexOf('{'), end = jsonText.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) jsonText = jsonText.slice(start, end + 1);

  try {
    const data = JSON.parse(jsonText);
    const receiptData = {
      merchant: data.merchant || '',
      date: data.date || '',
      items: Array.isArray(data.items) ? data.items : [],
      subtotal: data.subtotal || '',
      tax: data.tax || '',
      total: data.total || ''
    };
    receiptData.items = receiptData.items.map(it => ({ name: it.name || '', price: formatPrice(it.price) }));
    receiptData.subtotal = formatPrice(receiptData.subtotal);
    receiptData.tax = formatPrice(receiptData.tax);
    receiptData.total = formatPrice(receiptData.total);
    renderReceipt(receiptData);
  } catch (err) {
    // fallback: treat output as cleaned OCR text and re-parse locally
    const fallback = parseReceiptText(outputText);
    renderReceipt(fallback);
  }
}

// ============================================================================
// End of file
// ============================================================================
