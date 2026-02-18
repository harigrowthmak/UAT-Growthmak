const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    // CORS — allow any origin (n8n cloud, your frontend, etc.)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Health check
    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', message: 'UAT GrowthMak API is running' }));
        return;
    }

    // ─────────────────────────────────────────────────────────────────────
    // POST /analyze
    // Called by n8n after UAT completes.
    // Body: { "googleSheetUrl": "https://docs.google.com/spreadsheets/..." }
    // Returns: { "status": "Success", "googlesheet": "...", "message": "..." }
    // ─────────────────────────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/analyze') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });

        req.on('end', () => {
            console.log('[/analyze] Received body:', body);

            let parsed = {};
            try { parsed = JSON.parse(body); } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error', message: 'Invalid JSON body' }));
                return;
            }

            // Accept any of these field names for the sheet URL
            const sheetUrl =
                parsed.googleSheetUrl ||
                parsed.googlesheet ||
                parsed.googleSheet ||
                parsed.spreadsheetUrl ||
                parsed.url ||
                '';

            if (!sheetUrl) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'error',
                    message: 'Missing googleSheetUrl in request body.',
                    received: parsed
                }));
                return;
            }

            console.log('[/analyze] Sheet URL:', sheetUrl);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'Success',
                googlesheet: sheetUrl,
                message: 'UAT process completed successfully.'
            }));
        });

        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', message: 'Not Found' }));
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ UAT GrowthMak server running on port ${PORT}`);
    console.log(`   GET  /         — health check`);
    console.log(`   POST /analyze  — receive Google Sheet URL from n8n`);
});
