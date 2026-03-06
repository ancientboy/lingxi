# 灵犀云 - 一键部署完整配置指南

## 🎉 配置完成！

所有必需的阿里云资源配置已完成，现在可以使用一键部署功能了！

---

## ✅ 已完成的工作

### 1. 安全组配置
- **安全组 ID:** `sg-bp175bcj1jn10tbtxba8`
- **安全组名称:** sg-20260218
- **VPC:** lingxi (vpc-bp1c8ir53v5fdx1jzrozj)

### 2. 开放的端口

#### 必需端口（已配置）
| 端口 | 协议 | 用途 | 状态 |
|-----|------|------|------|
| **22** | TCP | SSH | ✅ |
| **3000** | TCP | 灵犀云前端 | ✅ |
| **9876** | TCP | 文件服务 | ✅ |
| **18789** | TCP | OpenClaw Gateway | ✅ |

#### 可选端口（已配置）
| 端口 | 协议 | 用途 | 状态 |
|-----|------|------|------|
| **80** | TCP | HTTP | ✅ |
| **443** | TCP | HTTPS | ✅ |
| **8080** | TCP | 备用 HTTP | ✅ (新添加) |
| **8000** | TCP | 备用 HTTP | ✅ (新添加) |

#### 其他端口
| 端口 | 协议 | 用途 | 状态 |
|-----|------|------|------|
| **13000** | TCP | AI 代理 | ✅ |
| **17860** | TCP | 其他服务 | ✅ |
| **3389** | TCP | RDP (多个规则) | ✅ |

### 3. 环境配置
- **VPC ID:** vpc-bp1c8ir53v5fdx1jzrozj
- **交换机 ID:** vsw-bp1uvezp9ubjvffznbcgu
- **可用区:** cn-hangzhou-h
- **实例规格:** ecs.t5-c1m2.large
- **系统盘:** 40GB
- **公网带宽:** 1 Mbps
- **自定义镜像:** m-bp1ambiod0o9ygpwo5xa (预装 Node.js 22 + OpenClaw)

---

## 🚀 一键部署流程

### 用户在前端操作

1. **登录灵犀云**
   - 访问: http://120.55.192.144:3000
   - 使用邀请码注册或登录

2. **点击"一键部署"**
   - 系统自动创建 ECS 实例
   - 自动配置安全组（使用标准配置）
   - 自动部署 OpenClaw + 文件服务

3. **等待部署完成**
   - 通常需要 3-5 分钟
   - 实时显示部署进度

4. **访问 Agent**
   - 部署完成后，自动生成访问链接
   - 格式: `http://<用户服务器IP>:18789/<session>/?token=<token>`

---

## 🔧 部署架构

```
用户点击"一键部署"
    ↓
灵犀云后端 (120.55.192.144:3000)
    ↓
阿里云 ECS API
    ↓
创建 ECS 实例 (使用自定义镜像)
    ↓
应用安全组 (sg-bp175bcj1jn10tbtxba8)
    ↓
SSH 连接 → 上传配置 → 启动服务
    ↓
用户访问 OpenClaw (端口 18789)
    ↓
文件预览服务自动可用 (端口 9876)
```

---

## 📋 配置文件位置

### 环境配置
```
/home/admin/.openclaw/workspace/lingxi-cloud/backend/.env
```

### 部署脚本
```
/home/admin/.openclaw/workspace/lingxi-cloud/backend/routes/deploy.js
```

### 工具脚本
```
scripts/check-aliyun-config.js         - 检查配置完整性
scripts/query-aliyun-resources.js      - 查询阿里云资源
scripts/check-security-group-rules.js  - 检查安全组规则
scripts/setup-security-group.js        - 配置安全组（备用）
```

---

## 🛠️ 管理命令

### 检查配置
```bash
cd /home/admin/.openclaw/workspace/lingxi-cloud
NODE_PATH=./backend/node_modules node scripts/check-aliyun-config.js
```

### 查询阿里云资源
```bash
NODE_PATH=./backend/node_modules node scripts/query-aliyun-resources.js
```

### 检查安全组规则
```bash
NODE_PATH=./backend/node_modules node scripts/check-security-group-rules.js
```

### 重启灵犀云服务
```bash
pm2 restart lingxi-cloud
```

### 查看服务状态
```bash
pm2 status
pm2 logs lingxi-cloud
```

---

## 📊 端口访问测试

### 从外部测试端口
```bash
# SSH
nc -zv 120.55.192.144 22

# 灵犀云前端
curl http://120.55.192.144:3000

# 文件服务
curl http://120.55.192.144:9876/health

# OpenClaw Gateway
curl http://120.55.192.144:18789
```

### 在服务器上检查端口监听
```bash
netstat -tlnp | grep -E "22|3000|9876|18789"
```

---

## 🔐 安全建议

### 生产环境配置

1. **限制 SSH 访问**（可选）
   ```bash
   # 在阿里云控制台修改安全组规则
   # 将 22 端口的授权对象改为特定 IP
   # 例如: 123.456.789.012/32
   ```

2. **配置 HTTPS**
   - 使用 Nginx 反向代理
   - 配置 SSL 证书
   - 开放 443 端口（已开放）

3. **定期审计**
   ```bash
   # 查看安全组规则
   NODE_PATH=./backend/node_modules node scripts/check-security-group-rules.js
   ```

---

## 📝 常见问题

### Q: 一键部署失败怎么办？
A: 检查以下内容：
1. 运行配置检查脚本
2. 查看 PM2 日志: `pm2 logs lingxi-cloud`
3. 检查阿里云账户余额

### Q: 如何添加新的端口？
A: 两种方法：
1. **自动方式:** 修改 `scripts/check-security-group-rules.js` 中的 `STANDARD_PORTS` 数组，然后运行脚本
2. **手动方式:** 在阿里云控制台 → 安全组 → 添加规则

### Q: 用户服务器的端口都一样吗？
A: 是的，所有新部署的用户服务器都使用相同的安全组（sg-bp175bcj1jn10tbtxba8），端口配置一致。

### Q: 如何修改已有服务器的安全组？
A: 在阿里云控制台：
1. 找到 ECS 实例
2. 点击"安全组"
3. 点击"配置规则"
4. 添加/修改/删除规则

---

## 🎯 下一步

### ✅ 已完成
- [x] 配置阿里云 VPC、交换机、安全组
- [x] 添加所有必需端口规则
- [x] 更新 .env 配置文件
- [x] 创建配置检查工具
- [x] 创建安全组管理工具
- [x] 文档化部署流程

### 🚀 可以开始
- [ ] 用户通过前端一键部署
- [ ] 测试部署流程
- [ ] 监控部署成功率
- [ ] 收集用户反馈

---

## 📞 支持

如有问题，请查看：
- 配置文档: `docs/security-group-config.md`
- 部署指南: `docs/file-preview-deployment-guide.md`
- PM2 日志: `pm2 logs lingxi-cloud`

---

**配置完成日期:** 2026-03-06
**配置人员:** 灵犀 (AI Agent)
**最后更新:** 2026-03-06 14:30

**🎉 灵犀云一键部署功能已就绪！** 🚀
