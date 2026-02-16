/**
 * 本地存储适配器 - 带记忆保护
 */

import fs from 'fs';
import path from 'path';

export class LocalMemoryAdapter {
  constructor(config = {}) {
    this.basePath = config.basePath || path.join(process.env.HOME || '', '.openclaw', 'memory');
    
    this.domains = {
      coding: path.join(this.basePath, 'domains', 'coding.json'),
      business: path.join(this.basePath, 'domains', 'business.json'),
      creative: path.join(this.basePath, 'domains', 'creative.json'),
      product: path.join(this.basePath, 'domains', 'product.json'),
      personal: path.join(this.basePath, 'domains', 'personal.json'),
      general: path.join(this.basePath, 'domains', 'general.json')
    };
    
    this.generalFile = this.domains.general;
    this.ensureDirectories();
  }

  ensureDirectories() {
    const domainsDir = path.join(this.basePath, 'domains');
    if (!fs.existsSync(domainsDir)) {
      fs.mkdirSync(domainsDir, { recursive: true });
    }
    
    for (const file of Object.values(this.domains)) {
      if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify({ items: [] }, null, 2));
      }
    }
  }

  generateId() {
    return `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getDomainFile(domain) {
    return (domain && this.domains[domain]) || this.generalFile;
  }

  readDomainFile(file) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return data.items || [];
    } catch (error) {
      return [];
    }
  }

  writeDomainFile(file, items) {
    fs.writeFileSync(file, JSON.stringify({ items }, null, 2));
  }

  async add(content, metadata = {}) {
    const item = {
      id: this.generateId(),
      content,
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };

    const file = this.getDomainFile(metadata.domain);
    const items = this.readDomainFile(file);
    items.push(item);
    this.writeDomainFile(file, items);

    return item;
  }
  
  async get(id) {
    for (const file of Object.values(this.domains)) {
      const items = this.readDomainFile(file);
      const item = items.find(i => i.id === id);
      if (item) return item;
    }
    return null;
  }

  async search(query, options = {}) {
    let results = [];

    const files = options.domain 
      ? [this.getDomainFile(options.domain)]
      : Object.values(this.domains);

    for (const file of files) {
      const items = this.readDomainFile(file);
      
      for (const item of items) {
        if (item.content.toLowerCase().includes(query.toLowerCase())) {
          results.push(item);
        }
      }
    }

    if (options.type) {
      results = results.filter(i => i.metadata?.type === options.type);
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  async getByDomain(domain) {
    const file = this.getDomainFile(domain);
    return this.readDomainFile(file);
  }
  
  // 🛡️ 记忆保护：删除需要检查重要性
  async delete(id) {
    const item = await this.get(id);
    
    if (!item) {
      return false;
    }
    
    // 重要记忆不能删除
    const importance = item.metadata?.importance || 0;
    if (importance >= 7) {
      console.log(`❌ 不能删除重要记忆: ${item.content}`);
      console.log(`   重要性: ${importance}/10`);
      return false;
    }
    
    // 普通记忆可以删除
    for (const file of Object.values(this.domains)) {
      const items = this.readDomainFile(file);
      const index = items.findIndex(i => i.id === id);
      
      if (index !== -1) {
        items.splice(index, 1);
        this.writeDomainFile(file, items);
        console.log(`✅ 已删除低重要性记忆`);
        return true;
      }
    }
    
    return false;
  }
  
  // 🚫 禁止清理所有记忆
  async clear() {
    console.log('❌ 禁止清理所有记忆！');
    console.log('   这是灵犀的进化成果！');
    throw new Error('禁止清理所有记忆！这是进化成果！');
  }
  
  // ✅ 只能清理低重要性的记忆
  async cleanupLowImportance(maxImportance = 3) {
    let cleaned = 0;
    
    console.log(`🧹 开始清理低重要性记忆 (importance <= ${maxImportance})...`);
    
    for (const [domain, file] of Object.entries(this.domains)) {
      const items = this.readDomainFile(file);
      const originalLength = items.length;
      
      // 只保留重要性 > maxImportance 的记忆
      const filtered = items.filter(item => {
        const imp = item.metadata?.importance || 0;
        return imp > maxImportance;
      });
      
      if (filtered.length < originalLength) {
        this.writeDomainFile(file, filtered);
        const removed = originalLength - filtered.length;
        cleaned += removed;
        console.log(`   ${domain}: 清理了 ${removed} 条`);
      }
    }
    
    if (cleaned > 0) {
      console.log(`✅ 总共清理了 ${cleaned} 条低重要性记忆`);
    } else {
      console.log(`✅ 没有需要清理的记忆（都是重要的）`);
    }
    
    return cleaned;
  }

  async getStats() {
    const stats = {
      total: 0,
      byDomain: {},
      byType: {},
      byImportance: {
        low: 0,      // 1-3
        medium: 0,   // 4-6
        high: 0,     // 7-8
        critical: 0  // 9-10
      }
    };
    
    for (const [domain, file] of Object.entries(this.domains)) {
      const items = this.readDomainFile(file);
      stats.byDomain[domain] = items.length;
      stats.total += items.length;
      
      for (const item of items) {
        const type = item.metadata?.type || 'unknown';
        stats.byType[type] = (stats.byType[type] || 0) + 1;
        
        const importance = item.metadata?.importance || 0;
        if (importance <= 3) stats.byImportance.low++;
        else if (importance <= 6) stats.byImportance.medium++;
        else if (importance <= 8) stats.byImportance.high++;
        else stats.byImportance.critical++;
      }
    }
    
    return stats;
  }
}

export default LocalMemoryAdapter;
