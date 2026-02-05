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
// OCR PROCESSING
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
    
    const { data: { text } } = await worker.recognize(imageFile);
    await worker.terminate();
    
    return text;
}

// ===========================
// TEXT PARSING
// ===========================
function parseReceiptText(text) {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    
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
    const totalPattern = /(total|amount)/i;
    const taxPattern = /(tax|hst|gst|vat)/i;
    const subtotalPattern = /(subtotal|sub-total)/i;

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

    // Parse items and totals
    for (let line of lines) {
        const cleanLine = line.trim();
        
        // Check for total
        if (totalPattern.test(cleanLine)) {
            const prices = cleanLine.match(pricePattern);
            if (prices) receiptData.total = prices[prices.length - 1];
            continue;
        }
        
        // Check for tax
        if (taxPattern.test(cleanLine)) {
            const prices = cleanLine.match(pricePattern);
            if (prices) receiptData.tax = prices[prices.length - 1];
            continue;
        }
        
        // Check for subtotal
        if (subtotalPattern.test(cleanLine)) {
            const prices = cleanLine.match(pricePattern);
            if (prices) receiptData.subtotal = prices[prices.length - 1];
            continue;
        }
        
        // Extract line items with prices
        const prices = cleanLine.match(pricePattern);
        if (prices && !totalPattern.test(cleanLine) && !taxPattern.test(cleanLine)) {
            const price = prices[prices.length - 1];
            const itemName = cleanLine.replace(price, '').trim();
            
            if (itemName) {
                receiptData.items.push({
                    name: itemName,
                    price: price
                });
            }
        }
    }

    return receiptData;
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
                <td>Item 1</td>
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
