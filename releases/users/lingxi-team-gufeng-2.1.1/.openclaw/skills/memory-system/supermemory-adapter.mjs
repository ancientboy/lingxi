/**
 * Supermemory 适配器 - 简化版
 */

import Supermemory from 'supermemory';

export class SupermemoryAdapter {
  constructor(config = {}) {
    const apiKey = config.apiKey || process.env.SUPERMEMORY_API_KEY;
    
    this.enabled = !!apiKey;
    this.client = null;
    
    if (this.enabled && apiKey) {
      this.client = new Supermemory({ apiKey });
    }
    
    this.userId = config.userId || 'default';
    this.containerTag = config.containerTag || this.userId;
  }

  checkEnabled() {
    if (!this.enabled || !this.client) {
      throw new Error('Supermemory is not enabled or API key is missing');
    }
  }

  generateId() {
    return `sm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async add(content, metadata = {}) {
    this.checkEnabled();
    
    const id = this.generateId();
    
    const enrichedContent = metadata?.domain
      ? `[${metadata.domain}] ${content}`
      : content;

    await this.client.add({
      content: enrichedContent,
      containerTag: this.containerTag,
      metadata: {
        id,
        ...metadata,
        createdAt: new Date().toISOString()
      }
    });

    return {
      id,
      content,
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString()
      }
    };
  }

  async search(query, options = {}) {
    this.checkEnabled();
    
    try {
      let searchQuery = query;
      
      if (options?.domain) {
        searchQuery = `[${options.domain}] ${query}`;
      }

      // 正确的API：使用 profile 而不是 search
      const profile = await this.client.profile({
        containerTag: this.containerTag,
        q: searchQuery
      });
      
      const results = (profile.searchResults?.results || [])
        .slice(0, options?.limit || 10)
        .map(r => ({
          id: r.memory?.id || this.generateId(),
          content: r.memory?.content || r.content || '',
          metadata: {
            score: r.score
          }
        }));

      return results;
    } catch (error) {
      console.error('Supermemory search error:', error);
      return [];
    }
  }

  async getByDomain(domain) {
    return await this.search(`[${domain}]`, { limit: 50 });
  }

  async getStats() {
    return {
      total: 0,
      byDomain: {},
      byType: {}
    };
  }

  isEnabled() {
    return this.enabled;
  }
}

export default SupermemoryAdapter;
