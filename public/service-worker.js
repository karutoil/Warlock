// Basic service worker for Warlock (root scope)
// This file is intended as a minimal, extendable SW that will by default
// forward streaming endpoints (SSE/chunked responses) directly to the network
// so the page can receive streaming bodies unbuffered.

// Version string for this service worker; bumping this (or changing the file) will trigger an update.
const SW_VERSION = '20251204.002';
const CACHE_NAME = 'warlock-' + SW_VERSION;

