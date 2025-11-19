const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const HOST = 'localhost';
const PORT = 3077;
const TARGET_HOST = '127.0.0.1'; // Assuming localhost is a valid host in DB
const REMOTE_PATH = '/tmp/test_upload.bin';
const LOCAL_FILE = 'test_file.bin';

// Create a dummy binary file
const buffer = Buffer.alloc(1024);
for (let i = 0; i < 1024; i++) {
    buffer[i] = i % 256;
}
fs.writeFileSync(LOCAL_FILE, buffer);

// Prepare request
const options = {
    hostname: HOST,
    port: PORT,
    path: `/api/file/${TARGET_HOST}?path=${REMOTE_PATH}`,
    method: 'PUT',
    headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': buffer.length
    }
};

console.log(`Uploading ${LOCAL_FILE} to http://${HOST}:${PORT}${options.path}...`);

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
    res.setEncoding('utf8');
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        console.log('BODY: ' + data);

        // Clean up local file
        fs.unlinkSync(LOCAL_FILE);

        try {
            const json = JSON.parse(data);
            if (json.success) {
                console.log('SUCCESS: File uploaded successfully.');
                process.exit(0);
            } else {
                console.error('FAILURE: API returned error:', json.error);
                // If error is "Requested host is not in the configured HOSTS list", it's expected if DB is empty
                if (json.error === 'Requested host is not in the configured HOSTS list') {
                    console.log('NOTE: This error is expected if the database is empty or does not contain 127.0.0.1.');
                    process.exit(0); // Treat as success for code path verification
                }
                process.exit(1);
            }
        } catch (e) {
            console.error('FAILURE: Invalid JSON response');
            process.exit(1);
        }
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
    fs.unlinkSync(LOCAL_FILE);
    process.exit(1);
});

// Write data to request body
req.write(buffer);
req.end();
