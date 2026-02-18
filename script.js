// ─── Config ───────────────────────────────────────────────────────────────────
const WEBHOOK_URL = 'https://n8n.srv896372.hstgr.cloud/webhook/uat-growthmak';

// Public notification channel (free, no login, robust for hours)
const NTFY_TOPIC = 'growthmak_uat_results';
const NTFY_URL = `https://ntfy.sh/${NTFY_TOPIC}/sse`;

// Timeout: 4 hours (to safely cover the 3 hour requirement)
const MAX_WAIT_TIME = 4 * 60 * 60 * 1000;

// ─── DOM Elements ─────────────────────────────────────────────────────────────
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

let eventSource = null;
let timeoutTimer = null;

// ─── Form Submit ──────────────────────────────────────────────────────────────
reviewForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const docUrl = document.getElementById('docUrl').value.trim();
    if (!docUrl) { showStatus('Please enter a website URL', 'error'); return; }

    // Generate a unique ID for this specific run
    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    console.log('Starting UAT. Request ID:', requestId);

    startProcessing();

    // 1. Start listening for the result BEFORE sending the request
    // This ensures we don't miss the notification if n8n is super fast
    listenForResults(requestId);

    try {
        // 2. Send the job to n8n
        const res = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: docUrl,
                requestId: requestId,  // Pass ID so n8n can send it back
                timestamp: new Date().toISOString()
            })
        });

        if (!res.ok) {
            throw new Error(`Server error: ${res.status}`);
        }

        console.log('Job submitted to n8n. Waiting for results via ntfy.sh...');

    } catch (err) {
        console.error('Submission error:', err);
        stopProcessing();
        showStatus('Failed to start UAT. Please check your connection.', 'error');
        if (eventSource) { eventSource.close(); eventSource = null; }
    }
});

// ─── Listen for Completion (ntfy.sh) ──────────────────────────────────────────
function listenForResults(targetRequestId) {
    if (eventSource) eventSource.close();

    console.log(`Listening to ${NTFY_URL} for ID: ${targetRequestId}`);
    eventSource = new EventSource(NTFY_URL);

    // Set 4-hour safety timeout
    timeoutTimer = setTimeout(() => {
        console.warn('Process timed out (4 hours).');
        stop();
        showStatus('UAT process timed out (exceeded 4 hours).', 'error');
    }, MAX_WAIT_TIME);

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            // ntfy sends the message body in 'message' field, or directly if structured
            // We expect n8n to send JSON string as the message body

            let payload = {};
            try {
                payload = JSON.parse(data.message); // Parse the inner JSON from n8n
            } catch {
                // Should not happen if n8n sends JSON, but robust fallback:
                console.log('Received raw message:', data.message);
                return;
            }

            console.log('Received update:', payload);

            // Check if this result is for US (matching requestId)
            if (payload.requestId === targetRequestId || payload.request_id === targetRequestId) {
                console.log('Match found! Process complete.');

                const sheetUrl = extractSheetUrl(payload);
                if (sheetUrl) {
                    stop(); // Close connection
                    showSuccess(sheetUrl, payload);
                } else {
                    console.warn('Got matching ID but no Sheet URL found:', payload);
                }
            }
        } catch (e) {
            console.error('Error parsing notification:', e);
        }
    };

    eventSource.onerror = (err) => {
        // SSE drops sometimes; browser auto-reconnects. We just log it.
        console.log('Connection check (sse)...', err);
    };
}

function stop() {
    if (eventSource) { eventSource.close(); eventSource = null; }
    if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
    stopProcessingUI();
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

    // Start step animation
    const steps = document.querySelectorAll('.step');
    steps.forEach((s) => s.classList.remove('active'));

    // Animate steps over time to simulate progress
    // Since it can take 3 hours, we just show the first few steps quickly
    setTimeout(() => steps[0].classList.add('active'), 1000); // Initializing
    setTimeout(() => steps[1].classList.add('active'), 4000); // Running checks
    // Last step 'Generating report' stays inactive until success
}

function stopProcessingUI() {
    submitBtn.disabled = false;
    btnText.classList.remove('invisible');
    loader.classList.add('hidden');
    processingOverlay.classList.remove('visible');
    setTimeout(() => processingOverlay.classList.add('hidden'), 500);
}

function showSuccess(sheetUrl, result) {
    // Light up final step
    const steps = document.querySelectorAll('.step');
    if (steps[2]) steps[2].classList.add('active');

    setTimeout(() => {
        stopProcessingUI();
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

        statusBadge.textContent = '✓ Success';
        if (result && result.status && result.status !== 'Success') {
            statusBadge.textContent = '✓ ' + result.status;
        }
    }, 800); // Small delay to let user see 'Generating report' checkmark
}

function extractSheetUrl(data) {
    if (!data) return null;
    const fields = ['googlesheet', 'googleSheet', 'spreadsheetUrl', 'url', 'link'];
    if (typeof data === 'object') {
        for (const f of fields) {
            if (data[f] && typeof data[f] === 'string' && data[f].startsWith('http')) return data[f];
        }
    }
    return null;
}

function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message status-${type}`;
    statusMessage.classList.remove('hidden');
    setTimeout(() => statusMessage.classList.add('hidden'), 7000);
}

function resetForm() {
    stop();
    reviewForm.reset();
    successView.classList.add('hidden');
    reviewForm.classList.remove('hidden');
    statusMessage.classList.add('hidden');
    statusBadge.textContent = '✓ Success';
    const iframe = document.getElementById('sheetIframe');
    if (iframe) iframe.src = '';
}

resetBtn.addEventListener('click', resetForm);

document.querySelectorAll('.form-input').forEach(input => {
    input.addEventListener('blur', () => input.classList.toggle('filled', !!input.value));
});
