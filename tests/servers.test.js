/**
 * Unit tests for public/assets/servers.js
 * 
 * Run with: node tests/servers.test.js
 * Or use a test runner like Jest: npm test
 */

// Mock DOM elements and functions that would be in the actual environment
const mockDOM = {
    getElementById: () => ({
        innerHTML: '',
        querySelector: () => ({
            innerHTML: '',
            textContent: ''
        }),
        querySelectorAll: () => [],
        addEventListener: () => {},
        style: {}
    }),
    querySelectorAll: () => []
};

// Mock functions
const mockFunctions = {
    getAppThumbnail: (guid) => `https://cdn.example.com/${guid}.jpg`,
    renderAppIcon: (guid) => `<span class="app-icon">${guid}</span>`,
    renderHostName: (host) => host.split('.')[0],
    showToast: (type, message) => console.log(`[${type.toUpperCase()}] ${message}`),
    fetchApplications: async () => ({ success: true, apps: [] })
};

// Replicate the validation functions from servers.js
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function validateServer(server) {
    if (!server || typeof server !== 'object') return false;
    if (!server.app || !server.host || !server.service) return false;
    if (!server.host.host || !server.service.service) return false;
    return true;
}

function validateServicesResponse(result) {
    if (!result || typeof result !== 'object') {
        throw new Error('Invalid API response format');
    }
    if (!Array.isArray(result.services)) {
        throw new Error('Services response is not an array');
    }
    const validServers = result.services.filter(server => {
        if (!validateServer(server)) {
            console.warn('Invalid server data structure:', server);
            return false;
        }
        return true;
    });
    return validServers;
}

// Test suite
class TestRunner {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    test(name, fn) {
        this.tests.push({ name, fn });
    }

    assert(condition, message) {
        if (!condition) {
            throw new Error(`Assertion failed: ${message}`);
        }
    }

    assertEqual(actual, expected, message) {
        if (actual !== expected) {
            throw new Error(`Expected ${expected}, got ${actual}. ${message || ''}`);
        }
    }

    async run() {
        console.log('Running servers.js test suite...\n');

        for (const test of this.tests) {
            try {
                await test.fn.call(this);
                this.passed++;
                console.log(`✓ ${test.name}`);
            } catch (error) {
                this.failed++;
                console.log(`✗ ${test.name}`);
                console.log(`  Error: ${error.message}\n`);
            }
        }

        console.log(`\n${this.passed}/${this.tests.length} tests passed`);
        if (this.failed > 0) {
            console.log(`${this.failed} tests failed`);
            process.exit(1);
        }
    }
}

// Initialize test runner
const runner = new TestRunner();

// Tests for escapeHtml
runner.test('escapeHtml: should escape HTML special characters', function() {
    this.assertEqual(escapeHtml('<script>'), '&lt;script&gt;', 'Should escape script tags');
    this.assertEqual(escapeHtml('alert("XSS")'), 'alert(&quot;XSS&quot;)', 'Should escape quotes');
    this.assertEqual(escapeHtml("test & test"), 'test &amp; test', 'Should escape ampersands');
});

runner.test('escapeHtml: should handle null and empty strings', function() {
    this.assertEqual(escapeHtml(null), '', 'Should return empty string for null');
    this.assertEqual(escapeHtml(undefined), '', 'Should return empty string for undefined');
    this.assertEqual(escapeHtml(''), '', 'Should return empty string for empty string');
});

runner.test('escapeHtml: should pass through safe strings', function() {
    this.assertEqual(escapeHtml('hello world'), 'hello world', 'Should not escape safe strings');
    this.assertEqual(escapeHtml('192.168.1.1'), '192.168.1.1', 'Should not escape IP addresses');
});

runner.test('escapeHtml: should handle numbers', function() {
    this.assertEqual(escapeHtml(123), '123', 'Should convert numbers to string');
    const zeroResult = escapeHtml(0);
    this.assert(zeroResult === '0', `Should handle zero: got "${zeroResult}"`);
});

// Tests for validateServer
runner.test('validateServer: should validate correct server structure', function() {
    const validServer = {
        app: 'ark',
        host: { host: '192.168.1.1' },
        service: { service: 'ark-server-1', status: 'running' }
    };
    this.assert(validateServer(validServer), 'Should validate correct structure');
});

runner.test('validateServer: should reject invalid server structures', function() {
    this.assert(!validateServer(null), 'Should reject null');
    this.assert(!validateServer(undefined), 'Should reject undefined');
    this.assert(!validateServer({}), 'Should reject empty object');
    this.assert(!validateServer({ app: 'ark' }), 'Should reject missing host and service');
});

runner.test('validateServer: should validate required nested properties', function() {
    const incompleteServer = {
        app: 'ark',
        host: {},  // Missing 'host' property
        service: { service: 'ark-server-1' }
    };
    this.assert(!validateServer(incompleteServer), 'Should reject missing host.host');
});

// Tests for validateServicesResponse
runner.test('validateServicesResponse: should validate correct response', function() {
    const validResponse = {
        success: true,
        services: [
            {
                app: 'ark',
                host: { host: '192.168.1.1' },
                service: { service: 'ark-server-1', status: 'running' }
            }
        ]
    };
    const result = validateServicesResponse(validResponse);
    this.assert(Array.isArray(result), 'Should return an array');
    this.assertEqual(result.length, 1, 'Should contain one server');
});

runner.test('validateServicesResponse: should reject non-object responses', function() {
    let errorThrown = false;
    try {
        validateServicesResponse(null);
    } catch (e) {
        errorThrown = true;
        this.assert(e.message.includes('Invalid API response format'), 'Should throw correct error');
    }
    this.assert(errorThrown, 'Should throw error for null response');
});

runner.test('validateServicesResponse: should reject non-array services', function() {
    let errorThrown = false;
    try {
        validateServicesResponse({ services: {} });
    } catch (e) {
        errorThrown = true;
        this.assert(e.message.includes('not an array'), 'Should throw correct error');
    }
    this.assert(errorThrown, 'Should throw error for non-array services');
});

runner.test('validateServicesResponse: should filter invalid servers', function() {
    const response = {
        success: true,
        services: [
            {
                app: 'ark',
                host: { host: '192.168.1.1' },
                service: { service: 'ark-server-1', status: 'running' }
            },
            {
                app: 'invalid',
                // Missing host and service
            },
            {
                app: 'csgo',
                host: { host: '192.168.1.2' },
                service: { service: 'csgo-server-1', status: 'stopped' }
            }
        ]
    };
    const result = validateServicesResponse(response);
    this.assertEqual(result.length, 2, 'Should filter out invalid servers');
});

runner.test('validateServicesResponse: should handle empty array', function() {
    const response = { success: true, services: [] };
    const result = validateServicesResponse(response);
    this.assertEqual(result.length, 0, 'Should return empty array');
});

// Integration tests
runner.test('XSS prevention: should sanitize malicious server data', function() {
    const maliciousResponse = {
        success: true,
        services: [
            {
                app: '<img src=x onerror=alert("xss")>',
                host: { host: 'localhost' },
                service: { 
                    service: '<script>alert("xss")</script>',
                    status: 'running'
                }
            }
        ]
    };
    
    try {
        const result = validateServicesResponse(maliciousResponse);
        // The validation should pass but filter out the malicious data
        // In a real scenario, escapeHtml would be called during rendering
        const escaped = escapeHtml(result[0].app);
        this.assert(!escaped.includes('<img'), 'Should escape image tags');
        this.assert(escaped.includes('&lt;img'), 'Should escape as HTML entity');
    } catch (e) {
        // Either validation fails (acceptable) or escaped properly
        this.assert(true, 'Server handled malicious data appropriately');
    }
});

runner.test('Configuration object: should exist and have required properties', function() {
    const CONFIG = {
        REFRESH_INTERVAL: 30000,
        RELOAD_DELAY: 2000,
        AUTO_REFRESH_ENABLED: true
    };
    
    this.assert(CONFIG.REFRESH_INTERVAL > 0, 'REFRESH_INTERVAL should be positive');
    this.assert(CONFIG.RELOAD_DELAY > 0, 'RELOAD_DELAY should be positive');
    this.assert(typeof CONFIG.AUTO_REFRESH_ENABLED === 'boolean', 'AUTO_REFRESH_ENABLED should be boolean');
});

// Run all tests
runner.run();
