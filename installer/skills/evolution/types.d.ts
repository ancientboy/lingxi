/**
 * 基因系统类型定义
 * @module skills/evolution/types
 */

/**
 * 基因分类
 */
export type GeneCategory =
  | 'debug'      // 调试
  | 'coding'     // 编程
  | 'writing'    // 写作
  | 'analysis'   // 分析
  | 'planning'   // 规划
  | 'tool';      // 工具使用

/**
 * 基因作用域
 */
export type GeneScope = 'private' | 'team' | 'platform';

/**
 * 策略内容
 */
export interface Strategy {
  /** 一句话描述策略 */
  description: string;
  /** 具体步骤 */
  steps: string[];
  /** 注意事项（可选） */
  tips?: string[];
}

/**
 * 环境适配胶囊
 * 工具 -> 命令/参数 的映射
 */
export interface Capsule {
  [tool: string]: string;
}

/**
 * 基因元数据
 */
export interface GeneMetadata {
  /** 来源：平台或用户 */
  author: 'platform' | 'user';
  /** 用户ID（用户基因） */
  user_id?: string;
  /** Agent ID（用户基因） */
  agent_id?: string;
  /** 作用域：private=私有, team=团队, platform=平台公开 */
  scope?: GeneScope;
  /** 适用的 agent 角色 */
  roles?: string[];
  /** 标签 */
  tags?: string[];
  /** 创建时间 ISO 8601 */
  created_at: string;
  /** 更新时间 ISO 8601 */
  updated_at: string;
  /** 评分 0-5 */
  score?: number;
  /** 使用次数 */
  usage_count?: number;
}

/**
 * 基因结构
 */
export interface Gene {
  // === 必需字段 ===
  /** 唯一标识 "gene-{category}-{name}" */
  id: string;
  /** 版本号 "1.0.0" */
  version: string;
  /** 简短名称 */
  name: string;
  /** 分类 */
  category: GeneCategory;
  /** 触发条件描述 */
  trigger: string;
  /** 策略内容 */
  strategy: Strategy;

  // === 可选字段 ===
  /** 环境适配 */
  capsules?: Record<string, Capsule>;
  /** 元数据 */
  metadata?: GeneMetadata;
}

/**
 * 基因索引
 */
export interface GeneIndex {
  /** 索引版本 */
  version: string;
  /** 上次同步时间戳 */
  last_sync: number;
  /** 是否允许上报 */
  upload_enabled: boolean;
  /** 基因列表 */
  genes: {
    /** 平台基因ID列表 */
    platform: string[];
    /** 本地基因ID列表 */
    local: string[];
  };
}

/**
 * 待上传基因记录
 */
export interface PendingUpload {
  /** 基因ID */
  gene_id: string;
  /** 加入时间 */
  added_at: string;
  /** 已上报次数 */
  upload_attempts: number;
}

/**
 * 基因评估结果
 */
export interface GeneEvaluation {
  /** 评分 0-5 */
  score: number;
  /** 评分原因 */
  reasons: string[];
}

/**
 * 同步结果
 */
export interface SyncResult {
  /** 同步的基因数量 */
  synced: number;
  /** 错误信息 */
  error?: string;
}

/**
 * 上传结果
 */
export interface UploadResult {
  /** 上传的基因数量 */
  uploaded: number;
  /** 错误信息 */
  error?: string;
}

/**
 * 进化模块配置
 */
export interface EvolutionConfig {
  /** 平台 API 地址 */
  platformApiUrl: string;
  /** 用户 Token */
  userToken: string;
  /** 实例 ID */
  instanceId: string;
  /** 用户 ID */
  userId: string;
  /** 是否启用上报 */
  uploadEnabled: boolean;
  /** 同步间隔（毫秒） */
  syncInterval: number;
}
