# 灵犀云端口标准化配置 - 完成总结

## ✅ 完成时间
2026-03-06 14:30

---

## 🎯 任务目标
完善一键部署的配套工作，确保所有用户服务器使用统一的端口配置和安全组规则。

---

## ✅ 已完成的工作

### 1. 安全组配置
- **使用现有安全组:** `sg-bp175bcj1jn10tbtxba8` (sg-20260218)
- **VPC:** `vpc-bp1c8ir53v5fdx1jzrozj` (lingxi)
- **交换机:** `vsw-bp1uvezp9ubjvffznbcgu`
- **可用区:** cn-hangzhou-h

### 2. 端口规则标准化

#### 必需端口（已全部配置）
| 端口 | 用途 | 状态 |
|-----|------|------|
| 22 | SSH | ✅ 已有 |
| 80 | HTTP | ✅ 已有 |
| 443 | HTTPS | ✅ 已有 |
| 3000 | 灵犀云前端 | ✅ 已有 |
| 9876 | 文件服务 | ✅ 已有 |
| 18789 | OpenClaw Gateway | ✅ 已有 |

#### 新增端口
| 端口 | 用途 | 状态 |
|-----|------|------|
| 8080 | 备用 HTTP | ✅ 新添加 |
| 8000 | 备用 HTTP | ✅ 新添加 |

### 3. 环境配置更新
已更新 `backend/.env` 文件，添加：
```
ALIYUN_VPC_ID=vpc-bp1c8ir53v5fdx1jzrozj
ALIYUN_VSWITCH_ID=vsw-bp1uvezp9ubjvffznbcgu
ALIYUN_SECURITY_GROUP_ID=sg-bp175bcj1jn10tbtxba8
ALIYUN_ZONE=cn-hangzhou-h
ALIYUN_INSTANCE_TYPE=ecs.t5-c1m2.large
ALIYUN_DISK_SIZE=40
ALIYUN_BANDWIDTH=1
```

### 4. 工具脚本创建

#### 配置检查工具
```bash
NODE_PATH=./backend/node_modules node scripts/check-aliyun-config.js
```
- 检查所有必需配置项
- 显示缺失的配置
- 输出示例配置

#### 资源查询工具
```bash
NODE_PATH=./backend/node_modules node scripts/query-aliyun-resources.js
```
- 查询现有 VPC、交换机、安全组
- 输出资源 ID 供配置使用

#### 安全组管理工具
```bash
NODE_PATH=./backend/node_modules node scripts/check-security-group-rules.js
```
- 检查安全组现有规则
- 自动添加缺失的端口
- 输出配置信息

### 5. 文档完善

#### 创建的文档
1. **security-group-config.md** - 安全组配置指南
   - 端口列表说明
   - 阿里云控制台配置步骤
   - CLI 配置方法
   - Terraform 配置示例

2. **one-click-deployment-guide.md** - 一键部署完整指南
   - 配置完成总结
   - 部署流程说明
   - 管理命令
   - 常见问题解答

---

## 🎯 一键部署流程

### 用户体验
1. 用户登录灵犀云
2. 点击"一键部署"
3. 系统自动：
   - 创建 ECS 实例（使用自定义镜像）
   - 应用标准安全组（sg-bp175bcj1jn10tbtxba8）
   - 配置所有端口（22, 80, 443, 3000, 9876, 18789, 8080, 8000）
   - 部署 OpenClaw + 文件服务
4. 生成访问链接
5. 用户直接使用

### 技术实现
```
用户请求
    ↓
灵犀云后端 (120.55.192.144:3000)
    ↓
阿里云 ECS API
    ↓
创建实例 + 应用安全组
    ↓
SSH 部署 OpenClaw + 文件服务
    ↓
用户访问 (端口 18789 + 9876)
```

---

## 📊 端口对照表

### 主服务器 (120.55.192.144)
| 端口 | 服务 | 说明 |
|-----|------|------|
| 22 | SSH | 远程管理 |
| 80 | Nginx | HTTP 入口 |
| 3000 | 灵犀云后端 | 前端界面 |
| 9876 | 文件服务 | 文件预览 |
| 13000 | AI 代理 | 内部服务 |
| 18789 | OpenClaw | Agent 服务 |

### 用户服务器（一键部署）
| 端口 | 服务 | 说明 |
|-----|------|------|
| 22 | SSH | 远程管理 |
| 80 | HTTP | 可选 |
| 443 | HTTPS | 可选 |
| 3000 | 灵犀云 | 可选（如果部署） |
| 9876 | 文件服务 | 文件预览 |
| 18789 | OpenClaw | Agent 服务 |
| 8080 | 备用 | 可选 |
| 8000 | 备用 | 可选 |

---

## 🔄 后续维护

### 添加新端口
1. 修改 `scripts/check-security-group-rules.js` 中的 `STANDARD_PORTS`
2. 运行脚本: `node scripts/check-security-group-rules.js`
3. 新端口会自动添加到安全组

### 修改端口规则
1. 登录阿里云控制台
2. 找到安全组 `sg-bp175bcj1jn10tbtxba8`
3. 修改规则
4. 所有新部署的用户自动使用新规则

### 监控部署
```bash
# 查看部署日志
pm2 logs lingxi-cloud

# 查看用户服务器列表
# 访问数据库: backend/data/db.json
# 查看 userServers 表
```

---

## ✨ 亮点

1. **统一配置** - 所有用户使用相同的安全组，端口配置一致
2. **自动化** - 一键部署自动应用安全组，无需手动配置
3. **可扩展** - 修改安全组规则，所有新用户自动生效
4. **工具完善** - 提供配置检查、资源查询、安全组管理工具
5. **文档齐全** - 详细的配置指南和部署文档

---

## 📝 配置文件清单

### 环境配置
- `backend/.env` - 完整配置，包含阿里云资源 ID

### 脚本工具
- `scripts/check-aliyun-config.js` - 配置检查
- `scripts/query-aliyun-resources.js` - 资源查询
- `scripts/check-security-group-rules.js` - 安全组管理
- `scripts/setup-security-group.js` - 安全组配置（备用）

### 文档
- `docs/security-group-config.md` - 安全组配置指南
- `docs/one-click-deployment-guide.md` - 一键部署完整指南
- `docs/file-preview-deployment-guide.md` - 文件预览部署指南

---

## 🎉 总结

**所有工作已完成！**

- ✅ 安全组配置完成
- ✅ 端口规则标准化
- ✅ 环境配置更新
- ✅ 工具脚本创建
- ✅ 文档完善
- ✅ 服务重启

**现在用户可以通过前端一键部署，自动获得完整的 OpenClaw + 文件服务环境！** 🚀

---

**配置完成:** 2026-03-06 14:30
**下次检查:** 建议在一键部署功能上线后，监控首次部署成功率
