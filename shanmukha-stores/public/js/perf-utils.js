/**
 * Shanmukha Stores - Core Web Vitals & Performance Utilities
 * Focus: INP < 200ms, Task Chunking, API Batching & Caching
 */

(function () {
  'use strict';

  // 1. Cooperative Multitasking Scheduler (INP Optimization)
  window.yieldToMain = async function () {
    if ('scheduler' in window && typeof window.scheduler.yield === 'function') {
      return window.scheduler.yield();
    }
    return new Promise(function (resolve) {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(resolve, { timeout: 50 });
      } else {
        setTimeout(resolve, 0);
      }
    });
  };

  // Chunk large array processing without blocking the UI main thread
  window.processChunked = async function (items, processFn, chunkSize) {
    chunkSize = chunkSize || 10;
    for (var i = 0; i < items.length; i++) {
      processFn(items[i], i);
      if (i > 0 && i % chunkSize === 0) {
        await window.yieldToMain();
      }
    }
  };

  // 2. Client-side TTL In-Memory & SessionStorage Cache
  var APICache = {
    _mem: new Map(),

    async get(url, ttlMs) {
      ttlMs = ttlMs || 120000; // 2 minutes default
      var now = Date.now();
      if (this._mem.has(url)) {
        var entry = this._mem.get(url);
        if (now - entry.time < ttlMs) {
          return entry.data;
        }
      }

      var res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('API fetch failed');
      var json = await res.json();
      this._mem.set(url, { data: json, time: now });
      return json;
    },

    invalidate(prefix) {
      if (!prefix) {
        this._mem.clear();
        return;
      }
      for (var key of this._mem.keys()) {
        if (key.indexOf(prefix) === 0) {
          this._mem.delete(key);
        }
      }
    }
  };

  window.APICache = APICache;

  // 3. Mark passive listeners for touch and wheel to eliminate scroll lag
  if (typeof EventTarget !== 'undefined') {
    var originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (type === 'touchstart' || type === 'touchmove' || type === 'wheel') {
        if (typeof options === 'boolean') {
          options = { capture: options, passive: true };
        } else if (typeof options === 'object' && options !== null && options.passive === undefined) {
          options.passive = true;
        }
      }
      return originalAddEventListener.call(this, type, listener, options);
    };
  }
})();
