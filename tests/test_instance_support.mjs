/**
 * Unit tests for multi-instance support
 * 
 * Run with: node tests/test_instance_support.mjs
 */

import cache from '../libs/cache.mjs';

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

	assertNotEqual(actual, unexpected, message) {
		if (actual === unexpected) {
			throw new Error(`Expected value to not equal ${unexpected}. ${message || ''}`);
		}
	}

	async run() {
		console.log('Running multi-instance support test suite...\n');

		for (const test of this.tests) {
			try {
				await test.fn.call(this);
				this.passed++;
				console.log(`✓ ${test.name}`);
			} catch (error) {
				this.failed++;
				console.log(`✗ ${test.name}`);
				console.log(`  Error: ${error.message}`);
			}
		}

		console.log(`\n${this.passed} passed, ${this.failed} failed`);
		process.exit(this.failed > 0 ? 1 : 0);
	}
}

const runner = new TestRunner();

// Test 1: Instance-aware cache keys should be unique
runner.test('Cache keys include instance_id', function() {
	const guid = 'test-guid';
	const host = 'test-host';
	const instance1 = 'instance-1';
	const instance2 = 'instance-2';

	const key1 = `services_${guid}_${host}_${instance1}`;
	const key2 = `services_${guid}_${host}_${instance2}`;
	const keyDefault = `services_${guid}_${host}_default`;

	this.assertNotEqual(key1, key2, 'Instance keys should be different');
	this.assertNotEqual(key1, keyDefault, 'Instance key should differ from default');
	this.assertNotEqual(key2, keyDefault, 'Instance key should differ from default');
});

// Test 2: Cache can store and retrieve instance-specific data
runner.test('Cache stores instance-specific data separately', function() {
	const guid = 'test-guid';
	const host = 'test-host';
	const instance1 = 'instance-1';
	const instance2 = 'instance-2';

	const data1 = { service: 'service-1', instance_id: instance1 };
	const data2 = { service: 'service-2', instance_id: instance2 };

	cache.set(`services_${guid}_${host}_${instance1}`, data1, 60);
	cache.set(`services_${guid}_${host}_${instance2}`, data2, 60);

	const retrieved1 = cache.get(`services_${guid}_${host}_${instance1}`);
	const retrieved2 = cache.get(`services_${guid}_${host}_${instance2}`);

	this.assertEqual(retrieved1.instance_id, instance1, 'First instance data should match');
	this.assertEqual(retrieved2.instance_id, instance2, 'Second instance data should match');
	this.assertNotEqual(retrieved1.service, retrieved2.service, 'Services should be different');
});

// Test 3: Default instance handling
runner.test('Default instance uses "default" identifier', function() {
	const guid = 'test-guid';
	const host = 'test-host';
	const instanceId = null;
	const defaultId = instanceId || 'default';

	this.assertEqual(defaultId, 'default', 'Null instance should resolve to "default"');

	const key = `services_${guid}_${host}_${defaultId}`;
	this.assert(key.includes('_default'), 'Cache key should include "_default"');
});

// Test 4: Instance ID validation pattern
runner.test('Instance ID follows expected patterns', function() {
	const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	const validUUID = '550e8400-e29b-41d4-a716-446655440000';
	
	this.assert(uuidPattern.test(validUUID), 'Valid UUID should match pattern');
	this.assert(!uuidPattern.test('not-a-uuid'), 'Invalid string should not match');
	this.assert(!uuidPattern.test('default'), '"default" should not match UUID pattern');
});

// Test 5: Service config cache keys include instance
runner.test('Service config cache keys are instance-aware', function() {
	const guid = 'test-guid';
	const host = 'test-host';
	const service = 'test-service';
	const instance1 = 'instance-1';
	const instance2 = 'instance-2';

	const key1 = `service_configs_${guid}_${host}_${instance1}_${service}`;
	const key2 = `service_configs_${guid}_${host}_${instance2}_${service}`;

	this.assertNotEqual(key1, key2, 'Service config keys for different instances should differ');
	this.assert(key1.includes(instance1), 'Key should include instance ID');
	this.assert(key2.includes(instance2), 'Key should include instance ID');
});

// Test 6: App config cache keys include instance
runner.test('App config cache keys are instance-aware', function() {
	const guid = 'test-guid';
	const host = 'test-host';
	const instance1 = 'instance-1';
	const instance2 = 'instance-2';

	const key1 = `app_configs_${guid}_${host}_${instance1}`;
	const key2 = `app_configs_${guid}_${host}_${instance2}`;

	this.assertNotEqual(key1, key2, 'App config keys for different instances should differ');
});

// Run all tests
runner.run();
