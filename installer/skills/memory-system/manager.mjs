/**
 * 记忆管理器 - 简化版
 */

import { LocalMemoryAdapter } from './local-adapter.mjs';
import { SupermemoryAdapter } from './supermemory-adapter.mjs';

export class MemoryManager {
  constructor(config = {}) {
    this.primary = config.primary || 'supermemory';
    this.cacheEnabled = config.cacheEnabled !== false;
    this.syncStrategy = config.syncStrategy || 'auto';
    this.adapters = {};
    this.cache = new Map();

    // 初始化本地适配器
    if (config.local?.enabled !== false) {
      this.adapters.local = new LocalMemoryAdapter({
        basePath: config.local?.basePath
      });
    }

    // 初始化Supermemory适配器
    if (config.supermemory?.enabled !== false) {
      this.adapters.supermemory = new SupermemoryAdapter({
        apiKey: config.supermemory?.apiKey,
        userId: config.supermemory?.userId
      });
    }
  }

  async add(content, metadata = {}) {
    const results = {};

    // 添加到主适配器
    if (this.adapters[this.primary]) {
      results[this.primary] = await this.adapters[this.primary].add(content, metadata);
    }

    // 自动同步到本地
    if (this.syncStrategy === 'auto' && this.adapters.local && this.primary !== 'local') {
      try {
        results.local = await this.adapters.local.add(content, metadata);
      } catch (error) {
        console.error('Failed to sync to local:', error);
      }
    }

    // 清除相关缓存
    this.clearCache(metadata.domain);

    return results[this.primary] || results.local;
  }

  async search(query, options = {}) {
    // 检查缓存
    const cacheKey = `${query}:${JSON.stringify(options)}`;
    if (this.cacheEnabled && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // 并行搜索所有适配器
    const searches = Object.entries(this.adapters).map(async ([name, adapter]) => {
      try {
        return await adapter.search(query, options);
      } catch (error) {
        console.error(`Search failed on ${name}:`, error);
        return [];
      }
    });

    const results = await Promise.all(searches);
    
    // 合并并去重
    const merged = this.mergeResults(results.flat());

    // 缓存结果
    if (this.cacheEnabled) {
      this.cache.set(cacheKey, merged);
    }

    return merged;
  }

  async getByDomain(domain) {
    // 检查缓存
    const cacheKey = `domain:${domain}`;
    if (this.cacheEnabled && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // 优先从本地获取
    if (this.adapters.local) {
      const localItems = await this.adapters.local.getByDomain(domain);
      if (localItems.length > 0) {
        if (this.cacheEnabled) {
          this.cache.set(cacheKey, localItems);
        }
        return localItems;
      }
    }

    // 本地没有，从云端获取
    if (this.adapters[this.primary] && this.primary !== 'local') {
      const cloudItems = await this.adapters[this.primary].getByDomain(domain);
      
      // 同步到本地
      if (this.syncStrategy === 'auto' && this.adapters.local && cloudItems.length > 0) {
        await this.adapters.local.batchAdd(
          cloudItems.map(item => ({
            content: item.content,
            metadata: item.metadata
          }))
        );
      }

      if (this.cacheEnabled) {
        this.cache.set(cacheKey, cloudItems);
      }
      
      return cloudItems;
    }

    return [];
  }

  async getStats() {
    const stats = {
      total: 0,
      byDomain: {},
      byType: {},
      byAdapter: {}
    };

    for (const [name, adapter] of Object.entries(this.adapters)) {
      try {
        const adapterStats = await adapter.getStats();
        stats.byAdapter[name] = { total: adapterStats.total };
        
        if (name === 'local') {
          stats.total = adapterStats.total;
          stats.byDomain = adapterStats.byDomain;
          stats.byType = adapterStats.byType;
        }
      } catch (error) {
        stats.byAdapter[name] = { total: 0 };
      }
    }

    return stats;
  }

  clearCache(domain) {
    if (domain) {
      for (const key of this.cache.keys()) {
        if (key.includes(domain)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  mergeResults(items) {
    const seen = new Set();
    const merged = [];

    for (const item of items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }

    return merged.sort((a, b) => {
      const impA = a.metadata?.importance || 0;
      const impB = b.metadata?.importance || 0;
      return impB - impA;
    });
  }

  getAdapter(name) {
    return this.adapters[name];
  }
}

export function createMemoryManager(config) {
  return new MemoryManager(config);
}

export default MemoryManager;
