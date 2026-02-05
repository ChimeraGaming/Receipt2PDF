// ============================================================================
// RECEIPT TO PDF SCANNER - MAIN APPLICATION LOGIC
// Copyright (c) 2026 ChimeraGaming. All Rights Reserved.
// ============================================================================

// ===========================
// DOM ELEMENT REFERENCES
// ===========================
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
const toggleSection = document.getElementById('toggleSection');
const includeImageToggle = document.getElementById('includeImageToggle');

// ===========================
// EVENT LISTENERS
// ===========================
uploadInput.addEventListener('change', handleFileUpload);
printBtn.addEventListener('click', handlePrint);
includeImageToggle.addEventListener('change', handleToggleChange);

// ===========================
// TOGGLE HANDLER
// ===========================
function handleToggleChange() {
    if (includeImageToggle.checked) {
        document.body.classList.add('include-image-print');
    } else {
        document.body.classList.remove('include-image-print');
    }
}

// ===========================
// PRINT HANDLER
// ===========================
function handlePrint() {
    handleToggleChange();
    window.print();
}

// ===========================
// FILE UPLOAD HANDLER
// ===========================
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Display image preview
    const reader = new FileReader();
    reader.onload = (e) => {
        const imageData = e.target.result;
        previewImg.src = imageData;
        printImg.src = imageData;
        imagePreview.style.display = 'block';
    };
    reader.readAsDataURL(file);

    // Start OCR process
    statusDiv.textContent = 'Processing image with OCR...';
    progressBar.style.display = 'block';
    
    try {
        const text = await runOCR(file);
        statusDiv.textContent = 'OCR Complete! Formatting receipt...';
        
        const receiptData = parseReceiptText(text);
        renderReceipt(receiptData);
        
        receiptContainer.style.display = 'block';
        toggleSection.style.display = 'block';
        printBtn.style.display = 'block';
        
        handleToggleChange();
        
        statusDiv.textContent = 'Done! Edit the receipt below and click "Print to PDF"';
        progressBar.style.display = 'none';
        
    } catch (error) {
        statusDiv.textContent = 'Error processing image. Please try again.';
        console.error(error);
        progressBar.style.display = 'none';
    }
}

// ===========================
// OCR PROCESSING (IMPROVED)
// ===========================
async function runOCR(imageFile) {
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
    
    // Improved Tesseract settings for better accuracy
    await worker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz$.,/- ',
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
    });
    
    const { data: { text } } = await worker.recognize(imageFile);
    await worker.terminate();
    
    return text;
}

// ===========================
// SPELL CORRECTION & NORMALIZATION
// ===========================

// Common receipt word corrections
const WORD_CORRECTIONS = {
    // Total variations
    'tota1': 'total',
    'tot4l': 'total',
    'totai': 'total',
    'tatal': 'total',
    'totel': 'total',
    'totsl': 'total',
    'baiance': 'balance',
    'balahce': 'balance',
    'balaace': 'balance',
    'ba1ance': 'balance',
    
    // Tax variations
    'tsx': 'tax',
    'tex': 'tax',
    'txx': 'tax',
    'txs': 'tax',
    
    // Subtotal variations
    'subtota1': 'subtotal',
    'sub-tota1': 'subtotal',
    'subtotai': 'subtotal',
    'sub-total': 'subtotal',
    'sub total': 'subtotal',
    
    // Common tax types
    'hst': 'tax',
    'gst': 'tax',
    'vat': 'tax',
    'pst': 'tax',
    'sales tax': 'tax',
    
    // Store names
    'safevay': 'safeway',
    'safewsy': 'safeway',
    'wslmart': 'walmart',
    'wa1mart': 'walmart',
    'tarqet': 'target',
    'tar9et': 'target',
    'cosfco': 'costco',
    'cast co': 'costco',
};

function correctWord(word) {
    const lower = word.toLowerCase().trim();
    return WORD_CORRECTIONS[lower] || word;
}

function correctLine(line) {
    return line.split(/\s+/).map(word => correctWord(word)).join(' ');
}

// Fuzzy matching for keywords
function fuzzyMatch(text, keywords) {
    text = text.toLowerCase();
    for (let keyword of keywords) {
        // Direct match
        if (text.includes(keyword)) return true;
        
        // Check with corrections
        const corrected = correctWord(text);
        if (corrected.toLowerCase().includes(keyword)) return true;
        
        // Levenshtein distance check (simple version)
        for (let word of text.split(/\s+/)) {
            if (levenshteinDistance(word, keyword) <= 2) return true;
        }
    }
    return false;
}

// Simple Levenshtein distance for fuzzy matching
function levenshteinDistance(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = [];

    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    return matrix[len1][len2];
}

// ===========================
// TEXT PARSING (IMPROVED)
// ===========================
function parseReceiptText(text) {
    const lines = text.split('\n').map(line => correctLine(line)).filter(line => line.trim() !== '');
    
    const receiptData = {
        merchant: '',
        date: '',
        items: [],
        subtotal: '',
        tax: '',
        total: ''
    };

    // Regular expression patterns
    const datePattern = /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})|(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/;
    const pricePattern = /\$?\s*\d+\.\d{2}/g;
    
    // Keywords for fuzzy matching
    const totalKeywords = ['total', 'balance', 'amount', 'due'];
    const taxKeywords = ['tax', 'hst', 'gst', 'vat', 'pst'];
    const subtotalKeywords = ['subtotal', 'sub-total', 'sub total'];

    // Extract merchant name (first line)
    if (lines.length > 0) {
        receiptData.merchant = lines[0].trim();
    }

    // Extract date
    for (let line of lines) {
        const dateMatch = line.match(datePattern);
        if (dateMatch) {
            receiptData.date = dateMatch[0];
            break;
        }
    }

    // Track if we've found totals section
    let inTotalsSection = false;
    
    // Parse items and totals
    for (let i = 0; i < lines.length; i++) {
        const cleanLine = lines[i].trim();
        const prices = cleanLine.match(pricePattern);
        
        if (!prices) continue;
        
        // Check for total using fuzzy matching
        if (fuzzyMatch(cleanLine, totalKeywords)) {
            receiptData.total = prices[prices.length - 1];
            inTotalsSection = true;
            continue;
        }
        
        // Check for tax using fuzzy matching
        if (fuzzyMatch(cleanLine, taxKeywords)) {
            receiptData.tax = prices[prices.length - 1];
            inTotalsSection = true;
            continue;
        }
        
        // Check for subtotal using fuzzy matching
        if (fuzzyMatch(cleanLine, subtotalKeywords)) {
            receiptData.subtotal = prices[prices.length - 1];
            inTotalsSection = true;
            continue;
        }
        
        // If we haven't hit totals section yet, this is likely an item
        if (!inTotalsSection) {
            const price = prices[prices.length - 1];
            const itemName = cleanLine.replace(price, '').trim();
            
            // Filter out very short names (likely garbage)
            if (itemName.length > 2) {
                receiptData.items.push({
                    name: itemName,
                    price: price
                });
            }
        }
    }

    // Fallback: if no total found, use the last large price
    if (!receiptData.total && lines.length > 0) {
        let maxPrice = 0;
        let maxPriceStr = '$0.00';
        
        for (let i = Math.max(0, lines.length - 10); i < lines.length; i++) {
            const prices = lines[i].match(pricePattern);
            if (prices) {
                for (let priceStr of prices) {
                    const priceVal = parseFloat(priceStr.replace('$', ''));
                    if (priceVal > maxPrice) {
                        maxPrice = priceVal;
                        maxPriceStr = priceStr;
                    }
                }
            }
        }
        
        if (maxPrice > 0) {
            receiptData.total = maxPriceStr;
        }
    }

    // Clean up prices (ensure $ sign)
    receiptData.subtotal = formatPrice(receiptData.subtotal);
    receiptData.tax = formatPrice(receiptData.tax);
    receiptData.total = formatPrice(receiptData.total);
    
    receiptData.items = receiptData.items.map(item => ({
        name: item.name,
        price: formatPrice(item.price)
    }));

    return receiptData;
}

// ===========================
// PRICE FORMATTING
// ===========================
function formatPrice(price) {
    if (!price) return '$0.00';
    
    // Remove any existing $ signs
    price = price.replace(/\$/g, '').trim();
    
    // Ensure it's a valid number
    const num = parseFloat(price);
    if (isNaN(num)) return '$0.00';
    
    // Format with $ sign and 2 decimals
    return '$' + num.toFixed(2);
}

// ===========================
// RECEIPT RENDERING
// ===========================
function renderReceipt(data) {
    const merchant = data.merchant || 'Store Name';
    const date = data.date || new Date().toLocaleDateString();
    
    // Build items HTML
    let itemsHTML = '';
    if (data.items.length > 0) {
        itemsHTML = data.items.map(item => `
            <tr>
                <td>${item.name}</td>
                <td class="price">${item.price}</td>
            </tr>
        `).join('');
    } else {
        itemsHTML = `
            <tr>
                <td>No items detected</td>
                <td class="price">$0.00</td>
            </tr>
        `;
    }

    const subtotal = data.subtotal || '$0.00';
    const tax = data.tax || '$0.00';
    const total = data.total || '$0.00';

    // Render receipt HTML
    receiptOutput.innerHTML = `
        <h2>${merchant}</h2>
        <p class="date">Date: ${date}</p>
        
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
            <p><span>Subtotal:</span><span>${subtotal}</span></p>
            <p><span>Tax:</span><span>${tax}</span></p>
            <p class="total"><span>Total:</span><span>${total}</span></p>
        </div>
    `;
}
