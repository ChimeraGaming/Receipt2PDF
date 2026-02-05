<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Receipt2PDF</title>
  <link rel="stylesheet" href="style.css" />
  <script src="https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.min.js"></script>
</head>
<body>
  <div class="container">
    <header>
      <h1>Receipt2PDF</h1>
      <p>Upload a receipt image, OCR it, edit, and print to PDF.</p>
    </header>

    <button id="printBtn" class="print-btn" style="display:none">Print to PDF</button>

    <div class="upload-section">
      <label for="uploadInput" class="upload-label">Choose Receipt Image</label>
      <input type="file" id="uploadInput" accept="image/*" />
      <div id="status" class="status"></div>
      <div id="progressBar" class="progress-bar" style="display:none;">
        <div id="progressFill" class="progress-fill"></div>
      </div>
    </div>

    <div id="imagePreview" class="image-preview" style="display:none;">
      <h3>Uploaded Image</h3>
      <img id="previewImg" alt="Receipt preview" />
    </div>

    <!-- Optional: AI Assist Section -->
    <div id="aiSection" class="toggle-section" style="display:none;">
      <h3>Optional AI Assist (external)</h3>

      <div style="margin-bottom:8px;">
        <label for="aiProvider">Provider:</label>
        <select id="aiProvider">
          <option value="hf">Hugging Face (text correction & extraction)</option>
          <option value="ocrspace">OCR.Space (alternative OCR)</option>
        </select>
      </div>

      <div style="margin-bottom:8px;">
        <label for="aiApiKey">API Key (stored locally):</label>
        <input id="aiApiKey" type="password" placeholder="Paste API key (local only)" />
        <button id="aiSaveKeyBtn">Save Key</button>
        <button id="aiClearKeyBtn">Clear Key</button>
      </div>

      <div style="margin-bottom:8px;">
        <button id="aiApplyBtn">Apply AI Correction</button>
        <span id="aiStatus" style="margin-left:8px;color:#444;"></span>
      </div>

      <p style="font-size:0.9em">
        Note: enabling AI will send OCR text (Hugging Face) or the image file
        (OCR.Space) to the provider. You must provide your own API key; keys are
        kept in your browser only. Free tiers may have limits.
      </p>
    </div>

    <div id="toggleSection" class="toggle-section" style="display:none;">
      <label class="toggle-container">
        <input type="checkbox" id="includeImageToggle" checked />
        <span class="toggle-slider"></span>
        <span class="toggle-label">Include original image in PDF printout</span>
      </label>
    </div>

    <div id="receiptContainer" class="receipt-wrapper" style="display:none;">
      <div id="printImageContainer" class="print-image-container">
        <h3>Original Receipt Image</h3>
        <img id="printImg" alt="Original receipt" />
      </div>

      <div id="receiptOutput" contenteditable="true" class="receipt-container"></div>
      <p class="edit-hint">Click any text to edit before printing</p>
    </div>

    <footer>
      <p>100% client-side. Keys are stored locally in your browser.</p>
    </footer>
  </div>

  <script src="app.js"></script>
</body>
</html>
