# Receipt2PDF

Client-side receipt scanner with OCR — upload, edit, and print receipts to PDF.  
Local-first: OCR runs in the browser (Tesseract). Optional AI assist (Hugging Face or OCR.Space) is available if you supply your own API key.

Live demo: https://chimeragaming.github.io/Receipt2PDF/ 

## Quick Features

- Upload receipt image in your browser
- Local OCR using Tesseract.js (no server required)
- Optional AI cleanup:
  - Hugging Face — text correction & JSON extraction
  - OCR.Space — cloud OCR alternative
- Editable formatted receipt and one-click Print to PDF
- Keys (if provided) are stored locally in the browser or can be placed in a local config file — never committed to the repo

## Security & Privacy (Important)

- API keys MUST NOT be committed to the repository. Do NOT paste keys into issues, PRs, or code.
- Keys stored via the app UI are saved in your browser's `localStorage` and stay only on that device.
- Alternatively use a local `config.js` (ignored by git) to provide keys to the app.
- If a key is ever exposed, revoke it at the provider immediately and generate a new one.

## How to Get API Keys

Hugging Face (for text correction / JSON extraction)
1. Visit: https://huggingface.co/settings/tokens
2. Click "New token" (name it e.g. `Receipt2PDF`)
3. Recommended scopes: minimal inference/read scopes (only what you need)
4. Copy the token and paste it into the app (see Storage below)

OCR.Space (alternative OCR)
1. Visit: https://ocr.space/ocrapi
2. Sign up and obtain an API key from your dashboard
3. Copy the key and paste it into the app (see Storage below)

## How to Store Keys (two safe options)

Option A — Use the in-app Key UI (recommended)
1. Open the app in your browser.
2. Upload any image to make the AI controls appear.
3. In the AI section:
   - Paste your Hugging Face token into the HF field and click "Save HF Key".
   - Paste your OCR.Space key into the OCR field and click "Save OCR Key".
4. Keys are stored under localStorage keys:
   - `receipt2pdf_hf_key`
   - `receipt2pdf_ocr_key`
5. To remove a key from the browser later: open DevTools → Console and run:
   - localStorage.removeItem('receipt2pdf_hf_key')
   - localStorage.removeItem('receipt2pdf_ocr_key')

Option B — Local config file (keeps keys off browser storage and out of VCS)
1. Create a file named `config.js` next to `index.html` (DO NOT commit this file).
2. Add:
```javascript
window.RECEIPT2PDF_CONFIG = {
  HUGGING_FACE_KEY: '<YOUR_HUGGINGFACE_KEY>',
  OCRSPACE_KEY: '<YOUR_OCRSPACE_KEY>'
};
