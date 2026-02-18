// ─── Config ───────────────────────────────────────────────────────────────────
const WEBHOOK_URL = 'https://n8n.srv896372.hstgr.cloud/webhook/uat-growthmak';
const RESULT_URL = 'https://uat-com.free.beeceptor.com/result';  // n8n POSTs here; we poll here
const POLL_INTERVAL = 4000;   // poll every 4 seconds
const POLL_TIMEOUT = 300000; // stop polling after 5 minutes

// ─── DOM ──────────────────────────────────────────────────────────────────────
const reviewForm = document.getElementById('reviewForm');
const submitBtn = document.getElementById('submitBtn');
const btnText = submitBtn.querySelector('.btn-text');
const loader = submitBtn.querySelector('.btn-loader');
const statusMessage = document.getElementById('statusMessage');
const processingOverlay = document.getElementById('processingOverlay');
const successView = document.getElementById('successView');
const successLink = document.getElementById('successLink');
const resetBtn = document.getElementById('resetBtn');
const statusBadge = document.getElementById('statusBadge');

let pollTimer = null;

// ─── Form Submit ──────────────────────────────────────────────────────────────
reviewForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const docUrl = document.getElementById('docUrl').value.trim();
    if (!docUrl) { showStatus('Please enter a URL', 'error'); return; }

    startProcessing();

    try {
        // Step 1: Send URL to n8n webhook (fire and forget — n8n will POST result to Beeceptor)
        const res = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: docUrl, timestamp: new Date().toISOString() })
        });

        const rawText = await res.text();
        console.log('n8n webhook response:', rawText);

        // Try to parse n8n response directly first (in case n8n returns the sheet URL immediately)
        let directResult = null;
        try { directResult = JSON.parse(rawText); } catch { directResult = { output: rawText }; }

        const directUrl = extractSheetUrl(directResult);
        if (directUrl) {
            // n8n returned the URL directly — no polling needed
            console.log('Got URL directly from n8n:', directUrl);
            showSuccess(directUrl, directResult);
            return;
        }

        // Step 2: n8n didn't return URL directly — start polling Beeceptor
        console.log('No URL in n8n response. Starting to poll:', RESULT_URL);
        startPolling();

    } catch (err) {
        console.error('Error sending to webhook:', err);
        // Even if webhook call fails, still poll — n8n may have received it
        console.log('Webhook error but still polling...');
        startPolling();
    }
});

// ─── Polling ──────────────────────────────────────────────────────────────────
function startPolling() {
    const startTime = Date.now();

    pollTimer = setInterval(async () => {
        // Timeout check
        if (Date.now() - startTime > POLL_TIMEOUT) {
            clearInterval(pollTimer);
            stopProcessing();
            showStatus('Timed out waiting for UAT results. Please try again.', 'error');
            return;
        }

        try {
            const res = await fetch(RESULT_URL, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (!res.ok) {
                console.log('Poll: not ready yet, status', res.status);
                return; // Keep polling
            }

            const rawText = await res.text();
            console.log('Poll response:', rawText);

            let result = null;
            try { result = JSON.parse(rawText); } catch { result = { output: rawText }; }

            const sheetUrl = extractSheetUrl(result);
            if (sheetUrl) {
                clearInterval(pollTimer);
                showSuccess(sheetUrl, result);
            } else {
                console.log('Poll: got response but no sheet URL yet:', rawText);
            }

        } catch (err) {
            console.log('Poll error (will retry):', err.message);
        }
    }, POLL_INTERVAL);
}

// ─── Extract Google Sheet URL from any response shape ─────────────────────────
function extractSheetUrl(data) {
    if (!data) return null;

    if (typeof data === 'string') {
        const match = data.match(/https?:\/\/docs\.google\.com\/spreadsheets\/[^\s"'<>]+/);
        return match ? match[0] : null;
    }

    if (Array.isArray(data)) {
        for (const item of data) {
            const found = extractSheetUrl(item);
            if (found) return found;
        }
        return null;
    }

    if (typeof data === 'object') {
        const fields = [
            'googlesheet', 'googleSheet', 'google_sheet',
            'spreadsheetUrl', 'sheetUrl', 'sheet_url',
            'url', 'output', 'result', 'link', 'href'
        ];
        for (const f of fields) {
            if (data[f] && typeof data[f] === 'string' && data[f].startsWith('http')) {
                return data[f];
            }
        }
        // Scan all string values with regex
        for (const key of Object.keys(data)) {
            if (typeof data[key] === 'string') {
                const match = data[key].match(/https?:\/\/docs\.google\.com\/spreadsheets\/[^\s"'<>]+/);
                if (match) return match[0];
            }
            if (typeof data[key] === 'object') {
                const found = extractSheetUrl(data[key]);
                if (found) return found;
            }
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

    const steps = document.querySelectorAll('.step');
    steps.forEach((s, i) => {
        s.classList.remove('active');
        setTimeout(() => s.classList.add('active'), 1500 * (i + 1));
    });
}

function stopProcessing() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
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
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    hideOverlay();
    reviewForm.classList.add('hidden');
    successView.classList.remove('hidden');

    successLink.href = sheetUrl;

    let embedUrl = sheetUrl;
    if (sheetUrl.includes('/edit')) embedUrl = sheetUrl.replace('/edit', '/preview');
    else if (!sheetUrl.includes('/preview')) {
        embedUrl = sheetUrl + (sheetUrl.includes('?') ? '&' : '?') + 'widget=true&headers=false';
    }
    const iframe = document.getElementById('sheetIframe');
    if (iframe) iframe.src = embedUrl;

    if (result && result.status) {
        statusBadge.textContent = '✓ ' + result.status;
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
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
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
    statusBadge.textContent = '✓ Success';
    statusBadge.className = 'status-badge';
    const iframe = document.getElementById('sheetIframe');
    if (iframe) iframe.src = '';
}

resetBtn.addEventListener('click', resetForm);

document.querySelectorAll('.form-input').forEach(input => {
    input.addEventListener('blur', () => input.classList.toggle('filled', !!input.value));
});
