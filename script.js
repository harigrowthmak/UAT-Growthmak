// Configuration
const WEBHOOK_URL = 'https://n8n.srv896372.hstgr.cloud/webhook/uat-growthmak';

// DOM Elements
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
const successMessage = document.querySelector('.success-message');

// Form Submit Handler
reviewForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Get form values
    const docUrl = document.getElementById('docUrl').value;

    // Validate form
    if (!docUrl) {
        showStatusMessage('Please enter a URL', 'error');
        return;
    }

    // Start processing
    startProcessing();

    try {
        // Prepare data
        const formData = {
            url: docUrl,
            timestamp: new Date().toISOString()
        };

        // Send to webhook
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            const result = await response.json();
            // Extract the googlesheet field from the webhook response
            const sheetUrl = result.googlesheet || result.url || result.spreadsheetUrl || result.output || (typeof result === 'string' ? result : null);

            if (sheetUrl) {
                showSuccess(sheetUrl, result);
            } else {
                throw new Error('No Google Sheet URL found in response');
            }
        } else {
            throw new Error(`Server responded with status: ${response.status}`);
        }
    } catch (error) {
        console.error('Error submitting form:', error);
        stopProcessing();
        showStatusMessage('Failed to submit request. Please try again.', 'error');
    }
});

// Reset button handler
resetBtn.addEventListener('click', () => {
    resetForm();
});

// Helper Functions
function startProcessing() {
    // Disable button
    submitBtn.disabled = true;
    btnText.classList.add('invisible');
    loader.classList.remove('hidden');

    // Show overlay with animation
    setTimeout(() => {
        processingOverlay.classList.remove('hidden');
        processingOverlay.classList.add('visible');
    }, 300);

    // Animate processing steps
    const steps = document.querySelectorAll('.step');
    steps.forEach((step, index) => {
        setTimeout(() => {
            step.classList.add('active');
        }, 1000 * (index + 1));
    });
}

function stopProcessing() {
    // Re-enable button
    submitBtn.disabled = false;
    btnText.classList.remove('invisible');
    loader.classList.add('hidden');

    // Hide overlay
    processingOverlay.classList.remove('visible');
    setTimeout(() => {
        processingOverlay.classList.add('hidden');
    }, 500);
}

function showSuccess(sheetUrl, result) {
    // Hide overlay
    processingOverlay.classList.remove('visible');
    setTimeout(() => {
        processingOverlay.classList.add('hidden');
    }, 500);

    // Hide form and show success view
    reviewForm.classList.add('hidden');
    successView.classList.remove('hidden');

    // Set success link
    successLink.href = sheetUrl;

    // Convert Google Sheets URL from edit to preview mode for embedding
    let embedUrl = sheetUrl;
    if (sheetUrl.includes('/edit')) {
        embedUrl = sheetUrl.replace('/edit', '/preview');
    } else if (!sheetUrl.includes('/preview')) {
        // If it doesn't have /edit or /preview, append /preview
        embedUrl = sheetUrl + (sheetUrl.includes('?') ? '&' : '?') + 'widget=true&headers=false';
    }

    // Set the iframe source to display the Google Sheet
    const sheetIframe = document.getElementById('sheetIframe');
    if (sheetIframe) {
        sheetIframe.src = embedUrl;
    }

    // Update status badge if result contains status
    if (result && result.status) {
        statusBadge.textContent = result.status;
        if (result.status.toLowerCase() === 'warning') {
            statusBadge.classList.add('status-warning');
        } else if (result.status.toLowerCase() === 'info') {
            statusBadge.classList.add('status-info');
        }
    }
}

function showStatusMessage(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message status-${type}`;
    statusMessage.classList.remove('hidden');

    // Auto-hide after 5 seconds
    setTimeout(() => {
        statusMessage.classList.add('hidden');
    }, 5000);
}

function resetForm() {
    // Reset form fields
    reviewForm.reset();

    // Hide success view and show form
    successView.classList.add('hidden');
    reviewForm.classList.remove('hidden');

    // Reset button state
    submitBtn.disabled = false;
    btnText.classList.remove('invisible');
    loader.classList.add('hidden');

    // Reset status message
    statusMessage.classList.add('hidden');

    // Reset processing overlay
    processingOverlay.classList.remove('visible');
    processingOverlay.classList.add('hidden');

    // Reset processing steps
    const steps = document.querySelectorAll('.step');
    steps.forEach((step, index) => {
        if (index > 1) {
            step.classList.remove('active');
        }
    });

    // Reset status badge
    statusBadge.textContent = 'Success';
    statusBadge.className = 'status-badge';

    // Clear the iframe
    const sheetIframe = document.getElementById('sheetIframe');
    if (sheetIframe) {
        sheetIframe.src = '';
    }
}

// Form field animations and validation
const formInputs = document.querySelectorAll('.form-input, .form-select');
formInputs.forEach(input => {
    input.addEventListener('blur', () => {
        if (input.value) {
            input.classList.add('filled');
        } else {
            input.classList.remove('filled');
        }
    });
});
