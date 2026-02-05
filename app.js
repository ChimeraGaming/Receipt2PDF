// Receipt2PDF - app.js
// Adds optional Hugging Face (text correction/extraction) and OCR.Space integrations.
// Keys are stored in localStorage only. Local Tesseract OCR + preprocessing remains the default.

// -----------------------------
// DOM refs
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
const aiApiKeyInput = document.getElementById('aiApiKey');
const aiSaveKeyBtn = document.getElementById('aiSaveKeyBtn');
const aiClearKeyBtn = document.getElementById('aiClearKeyBtn');
const aiApplyBtn = document.getElementById('aiApplyBtn');
const aiStatus = document.getElementById('aiStatus');

let lastOCRText = '';
let lastUploadedFile = null;

// -----------------------------
// Events
// -----------------------------
uploadInput.addEventListener('change', handleFileUpload);
printBtn.addEventListener('click', handlePrint);
includeImageToggle.addEventListener('change', handleToggleChange);
aiSaveKeyBtn.addEventListener('click', saveApiKey);
aiClearKeyBtn.addEventListener('click', clearApiKey);
aiApplyBtn.addEventListener('click', applyAICorrection);

// Load saved key (if any) on start
aiApiKeyInput.value = localStorage.getItem('receipt2pdf_api_key') || '';

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
// Small dictionary for local correction (compact)
// You can expand later.
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

// -----------------------------
// Image preprocessing (resize, grayscale, contrast, binarize)
// Returns dataURL of processed PNG
// -----------------------------
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

      // simple binarize by global threshold
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
// Tesseract OCR (local) - uses preprocessed image
// -----------------------------
async function runLocalOCR(file) {
  const dataURL = await fileToDataURL(file);
  const processedDataURL = await preprocessImageDataURL(dataURL);

  const worker = await Tesseract.createWorker({
    logger: (m) => {
      if (m.status === 'recognizing text') {
        const progress = Math.round(m.progress * 100);
        progressFill.style.width = progress + '%';
        progressFill.textContent = progress + '%';
      }
    }
  });

  await worker.loadLanguage('eng');
  await worker.initialize('eng');
  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.AUTO,
    tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$.,:-/ %'
  });

  const { data: { text } } = await worker.recognize(processedDataURL);
  await worker.terminate();
  return text;
}

// helper: File -> dataURL
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// -----------------------------
// Simple utilities: cleaning, levenshtein, corrections
// -----------------------------
function cleanForMatching(s) {
  return s.replace(/[\*\#\@\!\^\&\(\)\[\]\{\}\<\>\~\`\|\=\+\_]/g, ' ')
          .replace(/\s+/g, ' ').trim().toLowerCase();
}
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
// Local parsing heuristics (items/totals detection)
// -----------------------------
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

  const totalKeywords = ['total', 'balance', 'amount', 'due'];
  const taxKeywords = ['tax', 'hst', 'gst', 'vat', 'pst'];
  const subtotalKeywords = ['subtotal', 'sub-total', 'sub total'];

  if (lines.length > 0) receiptData.merchant = lines[0].replace(/\s{2,}/g, ' ').trim();

  for (let line of lines) {
    const m = line.match(datePattern);
    if (m) { receiptData.date = m[0]; break; }
  }

  let inTotals = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cleaned = cleanForMatching(line);
    const prices = line.match(pricePattern);
    if (!prices) continue;

    if (/\*+\s*(balance|total|amount)/i.test(line) || cleaned.includes('*** balance') || cleaned.includes('balance')) {
      receiptData.total = prices[prices.length - 1];
      inTotals = true; continue;
    }

    if (totalKeywords.some(k => cleaned.includes(k))) {
      receiptData.total = prices[prices.length - 1]; inTotals = true; continue;
    }
    if (taxKeywords.some(k => cleaned.includes(k))) {
      receiptData.tax = prices[prices.length - 1]; inTotals = true; continue;
    }
    if (subtotalKeywords.some(k => cleaned.includes(k))) {
      receiptData.subtotal = prices[prices.length - 1]; inTotals = true; continue;
    }

    if (!inTotals) {
      const priceStr = prices[prices.length - 1];
      const itemName = line.replace(priceStr, '').trim();
      if (itemName.length >= 3) receiptData.items.push({ name: itemName, price: priceStr });
    }
  }

  if (!receiptData.total) {
    let max = 0, maxStr = '';
    for (let i = Math.max(0, lines.length - 12); i < lines.length; i++) {
      const p = lines[i].match(pricePattern);
      if (p) {
        for (const s of p) {
          const num = parseFloat(s.replace(/[^0-9.]/g, '')) || 0;
          if (num > max) { max = num; maxStr = s; }
        }
      }
    }
    if (max > 0) receiptData.total = maxStr;
  }

  receiptData.subtotal = formatPrice(receiptData.subtotal);
  receiptData.tax = formatPrice(receiptData.tax);
  receiptData.total = formatPrice(receiptData.total);
  receiptData.items = receiptData.items.map(it => ({ name: it.name, price: formatPrice(it.price) }));

  return receiptData;
}

// -----------------------------
// formatPrice helper
// -----------------------------
function formatPrice(p) {
  if (!p) return '$0.00';
  const cleaned = ('' + p).replace(/[^\d.]/g, '');
  const n = parseFloat(cleaned);
  if (isNaN(n)) return '$0.00';
  return '$' + n.toFixed(2);
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
    <table><thead><tr><th>Item</th><th style="text-align:right">Price</th></tr></thead>
      <tbody>${itemsHTML}</tbody>
    </table>
    <div class="totals">
      <p><span>Subtotal:</span><span>${escapeHtml(data.subtotal)}</span></p>
      <p><span>Tax:</span><span>${escapeHtml(data.tax)}</span></p>
      <p class="total"><span>Total:</span><span>${escapeHtml(data.total)}</span></p>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// -----------------------------
// File upload handler - glue
// -----------------------------
async function handleFileUpload(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  lastUploadedFile = file;

  // preview original
  const dataURL = await fileToDataURL(file);
  previewImg.src = dataURL;
  printImg.src = dataURL;
  imagePreview.style.display = 'block';

  statusDiv.textContent = 'Processing image with local OCR...';
  progressBar.style.display = 'block';
  progressFill.style.width = '0%';
  progressFill.textContent = '0%';

  try {
    const text = await runLocalOCR(file);
    lastOCRText = text;
    statusDiv.textContent = 'OCR Complete. Parsing...';
    const receiptData = parseReceiptText(text);
    renderReceipt(receiptData);

    receiptContainer.style.display = 'block';
    aiSection.style.display = 'block'; // show AI controls now
    document.getElementById('toggleSection').style.display = 'block';
    printBtn.style.display = 'block';

    statusDiv.textContent = 'Done. You can optionally apply AI corrections.';
    progressBar.style.display = 'none';
  } catch (err) {
    console.error(err);
    statusDiv.textContent = 'OCR failed: ' + (err.message || err);
    progressBar.style.display = 'none';
  }
}

// -----------------------------
// AI: saving/clearing API key locally
// -----------------------------
function saveApiKey() {
  const k = aiApiKeyInput.value.trim();
  if (!k) return alert('Paste an API key to save.');
  localStorage.setItem('receipt2pdf_api_key', k);
  aiStatus.textContent = 'Key saved locally';
  setTimeout(() => aiStatus.textContent = '', 3000);
}
function clearApiKey() {
  localStorage.removeItem('receipt2pdf_api_key');
  aiApiKeyInput.value = '';
  aiStatus.textContent = 'Key cleared';
  setTimeout(() => aiStatus.textContent = '', 3000);
}

// -----------------------------
// AI apply: calls provider based on selection
// -----------------------------
async function applyAICorrection() {
  const key = localStorage.getItem('receipt2pdf_api_key') || aiApiKeyInput.value.trim();
  if (!key) return alert('Please save an API key first (localStorage).');

  if (!lastOCRText && !lastUploadedFile) return alert('No OCR/text to improve. Upload a receipt first.');

  aiApplyBtn.disabled = true;
  aiApplyBtn.textContent = 'Working...';
  aiStatus.textContent = '';

  try {
    if (aiProvider.value === 'hf') {
      // send OCR text to Hugging Face for JSON extraction
      const model = 'google/flan-t5-small'; // reasonable small model; users may change
      const output = await callHuggingFaceCorrection(lastOCRText, key, model);
      handleCorrectedTextFromHF(output);
      aiStatus.textContent = 'Hugging Face correction applied';
    } else if (aiProvider.value === 'ocrspace') {
      // call OCR.Space with the image file
      if (!lastUploadedFile) throw new Error('No uploaded image to send to OCR.Space.');
      const ocrtext = await callOCRSpace(lastUploadedFile, key);
      lastOCRText = ocrtext; // update
      const receiptData = parseReceiptText(ocrtext);
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
// Hugging Face call: send OCR text and ask for JSON
// Returns raw model output string
// -----------------------------
async function callHuggingFaceCorrection(ocrText, apiKey, model = 'google/flan-t5-small') {
  // craft instruction prompt (model-dependent)
  const prompt = `You are given OCR text from a grocery receipt. Correct OCR mistakes and return ONLY valid JSON with these fields:
{
  "merchant":"", "date":"", "items":[{"name":"", "price":""}], "subtotal":"", "tax":"", "total":""
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
  // typical formats:
  // - [{ generated_text: "..." }]
  // - { generated_text: "..." }
  if (Array.isArray(json) && json[0] && json[0].generated_text) return json[0].generated_text;
  if (json.generated_text) return json.generated_text;
  if (typeof json === 'string') return json;
  return JSON.stringify(json);
}

// -----------------------------
// Parse HF output: try to extract JSON and render; fallback to local parse
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
    // fallback: treat model output as cleaned OCR text
    const fallback = parseReceiptText(outputText);
    renderReceipt(fallback);
  }
}

// -----------------------------
// OCR.Space call (image upload). Note: CORS may block direct browser requests for some users.
// -----------------------------
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
  if (data && data.ParsedResults && data.ParsedResults[0]) return data.ParsedResults[0].ParsedText || '';
  return '';
}

// -----------------------------
// End of file
// -----------------------------
