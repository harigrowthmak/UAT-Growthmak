// ─── Config ───────────────────────────────────────────────────────────────────
const WEBHOOK_URL = 'https://n8n.srv896372.hstgr.cloud/webhook/uat-growthmak';

// ─── DOM ──────────────────────────────────────────────────────────────────────
const reviewForm = document.getElementById('reviewForm');
const submitBtn = document.getElementById('submitBtn');
const btnText = submitBtn.querySelector('.btn-text');
const loader = submitBtn.querySelector('.loader');
const statusMessage = document.getElementById('statusMessage');
const processingOverlay = document.getElementById('processingOverlay');
const successView = document.getElementById('successView');
const successLink = document.getElementById('successLink');
const resetBtn = document.getElementById('resetBtn');
const statusBadge = document.getElementById('statusBadge');

// ─── Form Submit ──────────────────────────────────────────────────────────────
reviewForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const docUrl = document.getElementById('docUrl').value.trim();
    if (!docUrl) { showStatus('Please enter a URL', 'error'); return; }

    startProcessing();

    try {
        const res = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: docUrl, timestamp: new Date().toISOString() })
        });

        // Read raw text first — never assume JSON
        const rawText = await res.text();
        console.log('Raw webhook response:', rawText);

        if (!res.ok) {
            throw new Error(`Server error (${res.status}): ${rawText}`);
        }

        // Try to parse as JSON
        let result = null;
        try { result = JSON.parse(rawText); } catch { result = rawText; }

        console.log('Parsed result:', result);

        const sheetUrl = extractSheetUrl(result);
        if (sheetUrl) {
            showSuccess(sheetUrl, result);
        } else {
            // If we got a 200 but no URL, show what we got so user can debug
            throw new Error(`Got response but no Google Sheet URL found. Response: ${rawText.substring(0, 200)}`);
        }

    } catch (err) {
        console.error('Error:', err);
        stopProcessing();

        let msg = err.message || 'Something went wrong. Please try again.';
        if (err.name === 'TypeError' && msg.includes('fetch')) {
            msg = 'Network error — check your internet connection.';
        }
        showStatus(msg, 'error');
    }
});

// ─── Extract Sheet URL from any response shape ────────────────────────────────
function extractSheetUrl(data) {
    if (!data) return null;

    // Plain string URL
    if (typeof data === 'string') {
        const match = data.match(/https?:\/\/docs\.google\.com\/spreadsheets\/[^\s"'<>]+/);
        return match ? match[0] : null;
    }

    // Array — n8n often returns [{...}]
    if (Array.isArray(data)) {
        for (const item of data) {
            const found = extractSheetUrl(item);
            if (found) return found;
        }
        return null;
    }

    // Object — try common field names
    const fields = [
        'googlesheet', 'googleSheet', 'google_sheet', 'spreadsheetUrl',
        'sheetUrl', 'sheet_url', 'url', 'output', 'result', 'link', 'href'
    ];
    for (const f of fields) {
        if (data[f] && typeof data[f] === 'string' && data[f].startsWith('http')) {
            return data[f];
        }
    }

    // Recurse into nested objects
    for (const key of Object.keys(data)) {
        if (typeof data[key] === 'object') {
            const found = extractSheetUrl(data[key]);
            if (found) return found;
        }
        // Also scan string values for embedded URLs
        if (typeof data[key] === 'string') {
            const match = data[key].match(/https?:\/\/docs\.google\.com\/spreadsheets\/[^\s"'<>]+/);
            if (match) return match[0];
        }
    }

    return null;
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function startProcessing() {
    submitBtn.disabled = true;
    btnText.classList.add('invisible');
    loader.classList.remove('hidden');

    setTimeout(() => {
        processingOverlay.classList.remove('hidden');
        requestAnimationFrame(() => processingOverlay.classList.add('visible'));
    }, 200);

    // Animate steps one by one
    const steps = document.querySelectorAll('.step');
    steps.forEach((s, i) => {
        s.classList.remove('active');
        setTimeout(() => s.classList.add('active'), 1500 * (i + 1));
    });
}

function stopProcessing() {
    submitBtn.disabled = false;
    btnText.classList.remove('invisible');
    loader.classList.add('hidden');
    hideOverlay();
}

function hideOverlay() {
    processingOverlay.classList.remove('visible');
    setTimeout(() => processingOverlay.classList.add('hidden'), 500);
}

function showSuccess(sheetUrl, result) {
    hideOverlay();
    reviewForm.classList.add('hidden');
    successView.classList.remove('hidden');

    successLink.href = sheetUrl;

    // Embed URL
    let embedUrl = sheetUrl;
    if (sheetUrl.includes('/edit')) embedUrl = sheetUrl.replace('/edit', '/preview');
    else if (!sheetUrl.includes('/preview')) {
        embedUrl = sheetUrl + (sheetUrl.includes('?') ? '&' : '?') + 'widget=true&headers=false';
    }
    const iframe = document.getElementById('sheetIframe');
    if (iframe) iframe.src = embedUrl;

    if (result && result.status) {
        statusBadge.textContent = result.status;
        if (result.status.toLowerCase() === 'warning') statusBadge.classList.add('status-warning');
        else if (result.status.toLowerCase() === 'info') statusBadge.classList.add('status-info');
    }
}

function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message status-${type}`;
    statusMessage.classList.remove('hidden');
    setTimeout(() => statusMessage.classList.add('hidden'), 7000);
}

function resetForm() {
    reviewForm.reset();
    successView.classList.add('hidden');
    reviewForm.classList.remove('hidden');
    submitBtn.disabled = false;
    btnText.classList.remove('invisible');
    loader.classList.add('hidden');
    statusMessage.classList.add('hidden');
    processingOverlay.classList.remove('visible');
    processingOverlay.classList.add('hidden');
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    statusBadge.textContent = 'Success';
    statusBadge.className = 'status-badge';
    const iframe = document.getElementById('sheetIframe');
    if (iframe) iframe.src = '';
}

resetBtn.addEventListener('click', resetForm);

// Input fill state
document.querySelectorAll('.form-input').forEach(input => {
    input.addEventListener('blur', () => input.classList.toggle('filled', !!input.value));
});
