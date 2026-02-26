# 上传灵犀云到 Git

## 方式 1：GitHub（海外）

```bash
# 1. 在 GitHub 创建新仓库
# 访问: https://github.com/new
# 仓库名: lingxi-cloud
# 设为 Public

# 2. 添加远程仓库
cd /home/admin/.openclaw/workspace/lingxi-cloud
git remote add origin https://github.com/YOUR_USERNAME/lingxi-cloud.git

# 3. 推送
git push -u origin master
```

## 方式 2：Gitee（国内推荐）

```bash
# 1. 在 Gitee 创建新仓库
# 访问: https://gitee.com/projects/new
# 仓库名: lingxi-cloud
# 设为 Public

# 2. 添加远程仓库
cd /home/admin/.openclaw/workspace/lingxi-cloud
git remote add origin https://gitee.com/YOUR_USERNAME/lingxi-cloud.git

# 3. 推送
git push -u origin master
```

## 用户下载方式

上传后，用户可以这样下载：

```bash
# 从 GitHub
git clone https://github.com/YOUR_USERNAME/lingxi-cloud.git

# 从 Gitee（国内更快）
git clone https://gitee.com/YOUR_USERNAME/lingxi-cloud.git

# 安装
cd lingxi-cloud
./installer/scripts/install.sh
```

## 一键安装命令

上传后可以提供一键命令：

```bash
# GitHub
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/lingxi-cloud/main/installer/scripts/install.sh | bash

# Gitee
curl -fsSL https://gitee.com/YOUR_USERNAME/lingxi-cloud/raw/main/installer/scripts/install.sh | bash
```
