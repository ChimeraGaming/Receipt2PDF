// Receipt2PDF - app.js (local OCR + optional AI via localStorage keys)
// Important: This file does NOT contain any API keys. Keys are saved in the browser only.

// DOM refs
const uploadInput = document.getElementById('uploadInput');
const previewImg = document.getElementById('previewImg');
const printImg = document.getElementById('printImg');
const imagePreview = document.getElementById('imagePreview');
const receiptOutput = document.getElementById('receiptOutput');
const receiptContainer = document.getElementById('receiptContainer');
const printBtn = document.getElementById('printBtn');
const statusDiv = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');

const aiSection = document.getElementById('aiSection');
const aiProvider = document.getElementById('aiProvider');
const hfKeyInput = document.getElementById('hfKey');
const hfSaveBtn = document.getElementById('hfSaveBtn');
const hfClearBtn = document.getElementById('hfClearBtn');
const ocrKeyInput = document.getElementById('ocrKey');
const ocrSaveBtn = document.getElementById('ocrSaveBtn');
const ocrClearBtn = document.getElementById('ocrClearBtn');
const aiApplyBtn = document.getElementById('aiApplyBtn');
const aiStatus = document.getElementById('aiStatus');
const aiErrorDiv = document.getElementById('aiError');
const showProxyBtn = document.getElementById('showProxyBtn');

const copyOcrBtn = document.getElementById('copyOcrBtn');
const downloadOcrBtn = document.getElementById('downloadOcrBtn');
const controlsDiv = document.getElementById('controls');

const includeImageToggle = document.getElementById('includeImageToggle');

let lastOCRText = '';
let lastUploadedFile = null;

// Utility: read keys from localStorage
function getHuggingFaceKey() {
  return localStorage.getItem('receipt2pdf_hf_key') || '';
}
function getOCRSpaceKey() {
  return localStorage.getItem('receipt2pdf_ocr_key') || '';
}

// Save/clear button handlers
hfSaveBtn && hfSaveBtn.addEventListener('click', () => {
  const k = hfKeyInput.value.trim();
  if (!k) return alert('Paste your Hugging Face key before saving.');
  localStorage.setItem('receipt2pdf_hf_key', k);
  aiStatus.textContent = 'HF key saved locally';
  setTimeout(()=>aiStatus.textContent='',2000);
});
hfClearBtn && hfClearBtn.addEventListener('click', () => {
  localStorage.removeItem('receipt2pdf_hf_key');
  hfKeyInput.value = '';
  aiStatus.textContent = 'HF key cleared';
  setTimeout(()=>aiStatus.textContent='',2000);
});
ocrSaveBtn && ocrSaveBtn.addEventListener('click', () => {
  const k = ocrKeyInput.value.trim();
  if (!k) return alert('Paste your OCR.Space key before saving.');
  localStorage.setItem('receipt2pdf_ocr_key', k);
  aiStatus.textContent = 'OCR.Space key saved locally';
  setTimeout(()=>aiStatus.textContent='',2000);
});
ocrClearBtn && ocrClearBtn.addEventListener('click', () => {
  localStorage.removeItem('receipt2pdf_ocr_key');
  ocrKeyInput.value = '';
  aiStatus.textContent = 'OCR.Space key cleared';
  setTimeout(()=>aiStatus.textContent='',2000);
});

showProxyBtn && showProxyBtn.addEventListener('click', () => {
  // Show simple instructions to deploy a proxy (Vercel). You can replace this with a nicer modal.
  alert('If direct AI calls fail due to CORS, you can deploy a tiny proxy (Vercel/Netlify). Reply "proxy" and I will provide the exact files and steps.');
});

// copy/download OCR text
copyOcrBtn && copyOcrBtn.addEventListener('click', async () => {
  if (!lastOCRText) return alert('No OCR text available');
  await navigator.clipboard.writeText(lastOCRText);
  alert('OCR text copied to clipboard');
});
downloadOcrBtn && downloadOcrBtn.addEventListener('click', () => {
  if (!lastOCRText) return alert('No OCR text available');
  const blob = new Blob([lastOCRText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ocr.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// Toggle handler + print
includeImageToggle && includeImageToggle.addEventListener('change', () => {
  if (includeImageToggle.checked) document.body.classList.add('include-image-print');
  else document.body.classList.remove('include-image-print');
});
printBtn && printBtn.addEventListener('click', () => { window.print(); });

// File -> dataURL helper
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Preprocessing: resize + grayscale + simple binarize
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
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);

      let imgData = ctx.getImageData(0, 0, w, h);
      let d = imgData.data;

      for (let i = 0; i < d.length; i += 4) {
        let gray = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
        gray = (gray - 128) * 1.25 + 128;
        d[i] = d[i+1] = d[i+2] = gray;
      }
      ctx.putImageData(imgData, 0, 0);

      imgData = ctx.getImageData(0, 0, w, h);
      d = imgData.data;
      let sum = 0, count = 0;
      for (let i = 0; i < d.length; i += 4) { sum += d[i]; count++; }
      const avg = sum / count;
      const threshold = Math.max(100, Math.min(160, avg - 10));
      for (let i = 0; i < d.length; i += 4) {
        const v = d[i] > threshold ? 255 : 0;
        d[i] = d[i+1] = d[i+2] = v;
      }
      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataURL);
    img.src = dataURL;
  });
}

// Run Tesseract on preprocessed image
async function runLocalOCR(file) {
  const dataURL = await fileToDataURL(file);
  const processed = await preprocessImageDataURL(dataURL);

  const worker = await Tesseract.createWorker({
    logger: (m) => {
      if (m.status === 'recognizing text') {
        const progress = Math.round(m.progress * 100);
        if (progressFill) { progressFill.style.width = progress + '%'; progressFill.textContent = progress + '%'; }
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

// Simple parsing (same as before, kept local-only)
function formatPrice(p) {
  if (!p) return '$0.00';
  const cleaned = ('' + p).replace(/[^\d.]/g, '');
  const n = parseFloat(cleaned);
  if (isNaN(n)) return '$0.00';
  return '$' + n.toFixed(2);
}
function cleanForMatching(s) { return s.replace(/[\*\#\@\!\^\&\(\)\[\]\{\}\<\>\~\`\|\=\+\_]/g,' ').replace(/\s+/g,' ').trim().toLowerCase(); }

function parseReceiptText(text) {
  const rawLines = text.split('\n');
  const lines = rawLines.map(l => l.trim()).filter(l => l.length > 0);

  const receiptData = { merchant:'', date:'', items:[], subtotal:'', tax:'', total:'' };
  const datePattern = /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})|(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/;
  const pricePattern = /\$?\s*\d+(?:\.\d{2})/g;

  if (lines.length) receiptData.merchant = lines[0];

  for (const l of lines) { const m = l.match(datePattern); if (m) { receiptData.date = m[0]; break; } }

  let inTotals = false;
  for (const l of lines) {
    const prices = l.match(pricePattern);
    const cleaned = cleanForMatching(l);
    if (!prices) continue;

    if (/\*+\s*(balance|total|amount)/i.test(l) || cleaned.includes('balance')) { receiptData.total = prices[prices.length-1]; inTotals = true; continue; }
    if (['total','balance','amount','due'].some(k => cleaned.includes(k))) { receiptData.total = prices[prices.length-1]; inTotals = true; continue; }
    if (['tax','hst','gst','vat','pst'].some(k => cleaned.includes(k))) { receiptData.tax = prices[prices.length-1]; inTotals = true; continue; }
    if (['subtotal','sub-total','sub total'].some(k => cleaned.includes(k))) { receiptData.subtotal = prices[prices.length-1]; inTotals = true; continue; }

    if (!inTotals) {
      const priceStr = prices[prices.length-1];
      const itemName = l.replace(priceStr,'').trim();
      if (itemName.length >= 2) receiptData.items.push({ name:itemName, price:priceStr });
    }
  }

  if (!receiptData.total) {
    let max = 0, maxStr = '';
    for (let i = Math.max(0, lines.length-12); i < lines.length; i++) {
      const p = lines[i].match(pricePattern);
      if (p) for (const s of p) { const n = parseFloat(s.replace(/[^\d.]/g,'')) || 0; if (n > max) { max = n; maxStr = s; } }
    }
    if (max > 0) receiptData.total = maxStr;
  }

  receiptData.subtotal = formatPrice(receiptData.subtotal);
  receiptData.tax = formatPrice(receiptData.tax);
  receiptData.total = formatPrice(receiptData.total);
  receiptData.items = receiptData.items.map(it => ({ name: it.name, price: formatPrice(it.price) }));
  return receiptData;
}

function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function renderReceipt(data) {
  const merchant = data.merchant || 'Store Name';
  const date = data.date || new Date().toLocaleDateString();
  let itemsHTML = '';
  if (data.items.length) itemsHTML = data.items.map(it => `<tr><td>${escapeHtml(it.name)}</td><td class="price">${escapeHtml(it.price)}</td></tr>`).join('');
  else itemsHTML = `<tr><td>No items detected</td><td class="price">$0.00</td></tr>`;

  receiptOutput.innerHTML = `
    <h2>${escapeHtml(merchant)}</h2>
    <p class="date">Date: ${escapeHtml(date)}</p>
    <table><thead><tr><th>Item</th><th style="text-align:right">Price</th></tr></thead><tbody>${itemsHTML}</tbody></table>
    <div class="totals"><p><span>Subtotal:</span><span>${escapeHtml(data.subtotal)}</span></p><p><span>Tax:</span><span>${escapeHtml(data.tax)}</span></p><p class="total"><span>Total:</span><span>${escapeHtml(data.total)}</span></p></div>
  `;

  receiptContainer.style.display = 'block';
  aiSection.style.display = 'block';
  controlsDiv.style.display = 'block';
  document.getElementById('toggleSection').style.display = 'block';
  printBtn.style.display = 'block';
}

// File upload handler
uploadInput && uploadInput.addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  lastUploadedFile = file;
  const dataURL = await fileToDataURL(file);
  previewImg.src = dataURL;
  printImg.src = dataURL;
  imagePreview.style.display = 'block';
  statusDiv.textContent = 'Running local OCR...';
  progressBar.style.display = 'block';
  if (progressFill) { progressFill.style.width = '0%'; progressFill.textContent = '0%'; }

  try {
    const text = await runLocalOCR(file);
    lastOCRText = text;
    const parsed = parseReceiptText(text);
    renderReceipt(parsed);
    statusDiv.textContent = 'OCR complete. You can optionally apply AI corrections.';
    progressBar.style.display = 'none';
  } catch (err) {
    console.error(err);
    statusDiv.textContent = 'OCR failed: ' + (err.message || err);
    progressBar.style.display = 'none';
  }
});

// -----------------------------
// AI calls (direct, with graceful CORS handling)
// -----------------------------
async function callHuggingFaceCorrection(ocrText, apiKey, model='google/flan-t5-small') {
  // Construct prompt for HF
  const prompt = `You are given OCR-extracted text from a grocery receipt. Correct OCR mistakes and return ONLY valid JSON with fields:
{ "merchant":"", "date":"", "items":[{"name":"","price":""}], "subtotal":"", "tax":"", "total":"" }
OCR TEXT:
"""${ocrText.replace(/`/g, "'")}"""`;

  // Direct browser call (may be blocked by CORS)
  const body = JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 512 } });
  const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body
  });
  if (!res.ok) {
    const txt = await res.text();
    const err = new Error('HF returned ' + res.status + ': ' + txt);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  if (Array.isArray(json) && json[0] && json[0].generated_text) return json[0].generated_text;
  if (json.generated_text) return json.generated_text;
  return typeof json === 'string' ? json : JSON.stringify(json);
}

// Handle AI apply: tries direct; if CORS or network error, show options
aiApplyBtn && aiApplyBtn.addEventListener('click', async () => {
  aiErrorDiv.style.display = 'none';
  aiErrorDiv.textContent = '';
  aiStatus.textContent = '';
  const provider = aiProvider.value;
  const hfKey = getHuggingFaceKey();
  const ocrKey = getOCRSpaceKey();
  if (!lastOCRText && !lastUploadedFile) return alert('Upload a receipt first.');

  if (provider === 'hf' && !hfKey) return alert('No HF key saved. Paste it in and click Save.');
  if (provider === 'ocrspace' && !ocrKey) return alert('No OCR.Space key saved. Paste it in and click Save.');

  aiApplyBtn.disabled = true; aiApplyBtn.textContent = 'Working...';
  try {
    if (provider === 'hf') {
      // try direct HF call
      try {
        const out = await callHuggingFaceCorrection(lastOCRText, hfKey);
        handleHFOutput(out);
        aiStatus.textContent = 'Hugging Face correction applied';
      } catch (err) {
        // likely CORS/net error
        console.error('HF call error', err);
        aiErrorDiv.style.display = 'block';
        aiErrorDiv.innerHTML = `AI call failed: ${err.message || err}.<br>
          This often means the browser blocked the request (CORS). You can either:
          <ul>
            <li>Run a local curl command (copied for you) to call Hugging Face from your terminal</li>
            <li>Deploy a tiny serverless proxy (I can provide the code) and paste its URL in the app</li>
          </ul>`;
        // prepare a curl command for the user to run locally
        const prompt = `You are given OCR-extracted text from a grocery receipt. Correct OCR mistakes and return ONLY valid JSON with fields: { "merchant":"", "date":"", "items":[{"name":"","price":""}], "subtotal":"", "tax":"", "total":"" } OCR TEXT:\n"""${lastOCRText.replace(/`/g, "'")}"""`;
        const curl = `curl -X POST "https://api-inference.huggingface.co/models/google/flan-t5-small" -H "Authorization: Bearer <YOUR_HF_KEY>" -H "Content-Type: application/json" -d '{"inputs': ${JSON.stringify(prompt)}}'`;
        // show curl in aiErrorDiv and copy button
        const pre = document.createElement('pre'); pre.style.whiteSpace='pre-wrap'; pre.textContent = curl;
        aiErrorDiv.appendChild(pre);
        const copyButton = document.createElement('button');
        copyButton.textContent = 'Copy curl';
        copyButton.addEventListener('click', () => { navigator.clipboard.writeText(curl); alert('curl copied'); });
        aiErrorDiv.appendChild(copyButton);
      }
    } else {
      // OCR.Space path: attempt direct call (but often CORS-blocked)
      try {
        const form = new FormData();
        form.append('apikey', ocrKey);
        form.append('language', 'eng');
        form.append('isOverlayRequired', 'false');
        form.append('file', lastUploadedFile);
        const res = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: form });
        if (!res.ok) throw new Error('OCR.Space returned ' + res.status);
        const data = await res.json();
        const parsed = (data && data.ParsedResults && data.ParsedResults[0]) ? data.ParsedResults[0].ParsedText || '' : '';
        lastOCRText = parsed;
        const parsedReceipt = parseReceiptText(parsed);
        renderReceipt(parsedReceipt);
        aiStatus.textContent = 'OCR.Space OCR applied';
      } catch (err) {
        console.error('OCR.Space call error', err);
        aiErrorDiv.style.display = 'block';
        aiErrorDiv.innerHTML = `OCR.Space call failed: ${err.message || err}. Browser CORS is a common cause. Consider using the curl command or a proxy.`;
      }
    }
  } finally {
    aiApplyBtn.disabled = false;
    aiApplyBtn.textContent = 'Apply AI Correction';
  }
});

function handleHFOutput(text) {
  // try to extract JSON; if not present, fallback to local parse
  let jsonText = text.trim();
  const s = jsonText.indexOf('{'), e = jsonText.lastIndexOf('}');
  if (s !== -1 && e !== -1 && e > s) jsonText = jsonText.slice(s, e+1);
  try {
    const obj = JSON.parse(jsonText);
    const receiptData = {
      merchant: obj.merchant || '',
      date: obj.date || '',
      items: Array.isArray(obj.items) ? obj.items : [],
      subtotal: obj.subtotal || '',
      tax: obj.tax || '',
      total: obj.total || ''
    };
    receiptData.items = receiptData.items.map(it => ({ name: it.name || '', price: formatPrice(it.price) }));
    receiptData.subtotal = formatPrice(receiptData.subtotal);
    receiptData.tax = formatPrice(receiptData.tax);
    receiptData.total = formatPrice(receiptData.total);
    renderReceipt(receiptData);
  } catch (err) {
    // fallback: treat output as cleaned OCR text
    const fallback = parseReceiptText(text);
    renderReceipt(fallback);
  }
}

// On load: populate key inputs from localStorage
document.addEventListener('DOMContentLoaded', () => {
  hfKeyInput.value = localStorage.getItem('receipt2pdf_hf_key') || '';
  ocrKeyInput.value = localStorage.getItem('receipt2pdf_ocr_key') || '';
});
