/**
 * 统一记忆接口 - Memory Interface
 * 
 * 所有记忆适配器都必须实现这个接口
 * 确保不同记忆服务可以互换
 */

/**
 * 记忆项结构
 * @typedef {Object} MemoryItem
 * @property {string} id
 * @property {string} content
 * @property {Object} [metadata]
 */

/**
 * 搜索选项
 * @typedef {Object} SearchOptions
 * @property {string} [domain]
 * @property {string} [type]
 * @property {string[]} [tags]
 * @property {number} [limit]
 * @property {number} [offset]
 */

/**
 * 记忆适配器配置
 * @typedef {Object} MemoryAdapterConfig
 * @property {boolean} enabled
 */

export default {};
