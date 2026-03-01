const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

// OpenClaw 内置技能目录
const BUILTIN_SKILLS_PATH = '/usr/lib/node_modules/openclaw/skills';

/**
 * 获取 OpenClaw 内置技能列表
 */
router.get('/builtin', async (req, res) => {
  try {
    const skillsDir = await fs.readdir(BUILTIN_SKILLS_PATH);
    const skills = [];
    
    for (const dir of skillsDir) {
      const skillPath = path.join(BUILTIN_SKILLS_PATH, dir, 'SKILL.md');
      try {
        const stat = await fs.stat(skillPath);
        if (stat.isFile()) {
          // 读取 SKILL.md 文件
          const content = await fs.readFile(skillPath, 'utf-8');
          
          // 解析元数据
          const skill = parseSkillMd(content, dir);
          skills.push(skill);
        }
      } catch (e) {
        // 没有 SKILL.md 文件，跳过
      }
    }
    
    // 按名称排序
    skills.sort((a, b) => a.name.localeCompare(b.name));
    
    res.json({
      source: 'openclaw-builtin',
      total: skills.length,
      skills: skills
    });
  } catch (error) {
    console.error('获取内置技能失败:', error);
    res.status(500).json({ error: '获取内置技能失败', message: error.message });
  }
});

/**
 * 解析 SKILL.md 文件
 */
function parseSkillMd(content, dirName) {
  const skill = {
    id: dirName,
    name: dirName,
    shortDesc: '',
    fullDesc: '',
    icon: '📦',
    installCommand: 'clawhub install ' + dirName,
    agent: 'smart',
    version: '1.0.0',
    author: 'OpenClaw',
    builtin: true
  };
  
  // 解析 frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    
    // 提取字段
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    if (nameMatch) skill.name = nameMatch[1].trim();
    
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    if (descMatch) skill.shortDesc = descMatch[1].trim();
    
    const iconMatch = frontmatter.match(/^icon:\s*(.+)$/m);
    if (iconMatch) skill.icon = iconMatch[1].trim();
    
    const versionMatch = frontmatter.match(/^version:\s*(.+)$/m);
    if (versionMatch) skill.version = versionMatch[1].trim();
    
    const authorMatch = frontmatter.match(/^author:\s*(.+)$/m);
    if (authorMatch) skill.author = authorMatch[1].trim();
  }
  
  // 提取描述（第一个段落）
  const descMatch = content.match(/^---[\s\S]*?---\n\n([^#\n]+)/);
  if (descMatch && !skill.shortDesc) {
    skill.shortDesc = descMatch[1].trim().substring(0, 100);
  }
  
  // 提取完整描述
  const fullDescMatch = content.match(/^---[\s\S]*?---\n\n([\s\S]+?)(?=\n#|$)/);
  if (fullDescMatch) {
    skill.fullDesc = fullDescMatch[1].trim().substring(0, 300);
  }
  
  return skill;
}

module.exports = router;
