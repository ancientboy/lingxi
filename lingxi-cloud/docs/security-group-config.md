# 阿里云安全组配置指南

## 📋 标准端口列表

### 必需端口（用户访问）
| 端口 | 协议 | 用途 | 说明 |
|-----|------|------|------|
| **22** | TCP | SSH | 服务器远程管理（必需） |
| **3000** | TCP | 灵犀云前端 | 用户访问灵犀云界面（必需） |
| **9876** | TCP | 文件服务 | 文件预览和下载（必需） |
| **18789** | TCP | OpenClaw Gateway | Agent 服务入口（必需） |

### 常用端口（可选）
| 端口 | 协议 | 用途 | 说明 |
|-----|------|------|------|
| **80** | TCP | HTTP | Nginx 反向代理（推荐） |
| **443** | TCP | HTTPS | SSL 加密访问（推荐） |
| **8080** | TCP | 备用 HTTP | 常用备用端口 |
| **8000** | TCP | 备用 HTTP | 常用备用端口 |

### 内部端口（不对外开放）
| 端口 | 协议 | 用途 | 说明 |
|-----|------|------|------|
| 13000 | TCP | AI 代理 | 内部 AI API 代理 |
| 18790-18792 | TCP | OpenClaw 内部 | Gateway 内部通信 |

---

## 🚀 快速配置

### 方法 1: 使用阿里云控制台

1. **登录阿里云控制台**
   - 访问：https://ecs.console.aliyun.com/
   - 进入：网络与安全 → 安全组

2. **创建安全组**
   - 点击"创建安全组"
   - 名称：`lingxi-cloud-standard`
   - 描述：`灵犀云标准安全组配置`
   - 网络：选择专有网络（VPC）

3. **添加入方向规则**

   **必需规则（按顺序添加）：**
   
   ```
   # SSH
   端口范围: 22/22
   授权对象: 0.0.0.0/0
   协议: TCP
   优先级: 1
   
   # 灵犀云前端
   端口范围: 3000/3000
   授权对象: 0.0.0.0/0
   协议: TCP
   优先级: 1
   
   # 文件服务
   端口范围: 9876/9876
   授权对象: 0.0.0.0/0
   协议: TCP
   优先级: 1
   
   # OpenClaw Gateway
   端口范围: 18789/18789
   授权对象: 0.0.0.0/0
   协议: TCP
   优先级: 1
   
   # HTTP（可选）
   端口范围: 80/80
   授权对象: 0.0.0.0/0
   协议: TCP
   优先级: 1
   
   # HTTPS（可选）
   端口范围: 443/443
   授权对象: 0.0.0.0/0
   协议: TCP
   优先级: 1
   ```

4. **保存安全组 ID**
   - 创建完成后，复制安全组 ID（格式：`sg-xxxxxx`）
   - 添加到 `.env` 文件：`ALIYUN_SECURITY_GROUP_ID=sg-xxxxxx`

---

### 方法 2: 使用阿里云 CLI（自动化）

```bash
# 1. 安装阿里云 CLI
# macOS
brew install aliyun-cli

# Linux
wget https://aliyuncli.alicdn.com/aliyun-cli-linux-latest-amd64.tgz
tar -xzf aliyun-cli-linux-latest-amd64.tgz
mv aliyun /usr/local/bin/

# 2. 配置凭证
aliyun configure

# 3. 创建安全组
aliyun ecs CreateSecurityGroup \
  --RegionId cn-hangzhou \
  --SecurityGroupName lingxi-cloud-standard \
  --Description "灵犀云标准安全组配置" \
  --VpcId vpc-xxxxxx

# 记录返回的 SecurityGroupId

# 4. 添加规则（替换 sg-xxxxxx 为实际 ID）
# SSH
aliyun ecs AuthorizeSecurityGroup \
  --RegionId cn-hangzhou \
  --SecurityGroupId sg-xxxxxx \
  --IpProtocol tcp \
  --PortRange 22/22 \
  --SourceCidrIp 0.0.0.0/0 \
  --Priority 1

# 灵犀云前端
aliyun ecs AuthorizeSecurityGroup \
  --RegionId cn-hangzhou \
  --SecurityGroupId sg-xxxxxx \
  --IpProtocol tcp \
  --PortRange 3000/3000 \
  --SourceCidrIp 0.0.0.0/0 \
  --Priority 1

# 文件服务
aliyun ecs AuthorizeSecurityGroup \
  --RegionId cn-hangzhou \
  --SecurityGroupId sg-xxxxxx \
  --IpProtocol tcp \
  --PortRange 9876/9876 \
  --SourceCidrIp 0.0.0.0/0 \
  --Priority 1

# OpenClaw Gateway
aliyun ecs AuthorizeSecurityGroup \
  --RegionId cn-hangzhou \
  --SecurityGroupId sg-xxxxxx \
  --IpProtocol tcp \
  --PortRange 18789/18789 \
  --SourceCidrIp 0.0.0.0/0 \
  --Priority 1

# HTTP
aliyun ecs AuthorizeSecurityGroup \
  --RegionId cn-hangzhou \
  --SecurityGroupId sg-xxxxxx \
  --IpProtocol tcp \
  --PortRange 80/80 \
  --SourceCidrIp 0.0.0.0/0 \
  --Priority 1

# HTTPS
aliyun ecs AuthorizeSecurityGroup \
  --RegionId cn-hangzhou \
  --SecurityGroupId sg-xxxxxx \
  --IpProtocol tcp \
  --PortRange 443/443 \
  --SourceCidrIp 0.0.0.0/0 \
  --Priority 1
```

---

### 方法 3: 使用 Terraform（基础设施即代码）

```hcl
# security-group.tf

resource "alicloud_security_group" "lingxi" {
  name        = "lingxi-cloud-standard"
  description = "灵犀云标准安全组配置"
  vpc_id      = var.vpc_id
}

# 必需端口
resource "alicloud_security_group_rule" "ssh" {
  type              = "ingress"
  ip_protocol       = "tcp"
  port_range        = "22/22"
  security_group_id = alicloud_security_group.lingxi.id
  cidr_ip           = "0.0.0.0/0"
  priority          = 1
}

resource "alicloud_security_group_rule" "frontend" {
  type              = "ingress"
  ip_protocol       = "tcp"
  port_range        = "3000/3000"
  security_group_id = alicloud_security_group.lingxi.id
  cidr_ip           = "0.0.0.0/0"
  priority          = 1
}

resource "alicloud_security_group_rule" "file_server" {
  type              = "ingress"
  ip_protocol       = "tcp"
  port_range        = "9876/9876"
  security_group_id = alicloud_security_group.lingxi.id
  cidr_ip           = "0.0.0.0/0"
  priority          = 1
}

resource "alicloud_security_group_rule" "openclaw" {
  type              = "ingress"
  ip_protocol       = "tcp"
  port_range        = "18789/18789"
  security_group_id = alicloud_security_group.lingxi.id
  cidr_ip           = "0.0.0.0/0"
  priority          = 1
}

# 可选端口
resource "alicloud_security_group_rule" "http" {
  type              = "ingress"
  ip_protocol       = "tcp"
  port_range        = "80/80"
  security_group_id = alicloud_security_group.lingxi.id
  cidr_ip           = "0.0.0.0/0"
  priority          = 1
}

resource "alicloud_security_group_rule" "https" {
  type              = "ingress"
  ip_protocol       = "tcp"
  port_range        = "443/443"
  security_group_id = alicloud_security_group.lingxi.id
  cidr_ip           = "0.0.0.0/0"
  priority          = 1
}

output "security_group_id" {
  value = alicloud_security_group.lingxi.id
}
```

---

## ✅ 验证配置

### 1. 检查端口是否开放

```bash
# 从外部服务器测试
nc -zv <服务器IP> 22
nc -zv <服务器IP> 3000
nc -zv <服务器IP> 9876
nc -zv <服务器IP> 18789
```

### 2. 检查服务是否运行

```bash
# SSH 到服务器
ssh root@<服务器IP>

# 检查端口监听
netstat -tlnp | grep -E "22|3000|9876|18789"

# 检查服务状态
pm2 status
systemctl status openclaw-gateway
```

### 3. 浏览器访问

```
# 前端界面
http://<服务器IP>:3000

# 文件服务健康检查
http://<服务器IP>:9876/health

# OpenClaw Gateway
http://<服务器IP>:18789
```

---

## 🔐 安全建议

### 生产环境配置

1. **限制 SSH 访问**
   ```
   端口范围: 22/22
   授权对象: <你的IP>/32  # 只允许特定 IP
   ```

2. **使用 HTTPS**
   - 开放 443 端口
   - 配置 SSL 证书
   - 重定向 HTTP 到 HTTPS

3. **定期审计**
   - 检查安全组规则
   - 删除不必要的规则
   - 使用最小权限原则

---

## 📊 当前主服务器开放端口

```
22      - SSH (必需)
80      - Nginx (推荐)
631     - CUPS 打印服务 (可关闭)
9876    - 文件服务 (必需)
13000   - AI 代理 (内部)
18060   - Docker (可关闭)
18789   - OpenClaw Gateway (必需)
18791-18792 - OpenClaw 内部通信
```

**建议关闭：** 631 (CUPS)、18060 (Docker，除非需要)

---

## 🎯 下一步

1. ✅ 创建标准安全组
2. ✅ 配置 `.env` 文件中的 `ALIYUN_SECURITY_GROUP_ID`
3. ✅ 测试一键部署功能
4. ✅ 验证端口访问

---

**配置完成后，所有新部署的用户实例都会自动使用这套安全组规则！** 🚀
