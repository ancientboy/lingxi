/**
 * Skills 管理路由
 */

import express from 'express';
import { 
  AGENT_SKILLS, 
  isSkillInstalled, 
  installSkill, 
  installAgentSkills,
  getRecommendedSkills 
} from '../skills/clawhub-integration.mjs';

const router = express.Router();

/**
 * 获取所有可用的 Skills
 */
router.get('/available', (req, res) => {
  const allSkills = new Map();
  
  for (const [agentId, agent] of Object.entries(AGENT_SKILLS)) {
    for (const skill of agent.skills) {
      allSkills.set(skill.id, {
        ...skill,
        agent: agent.name
      });
    }
  }
  
  res.json({
    total: allSkills.size,
    skills: Array.from(allSkills.values())
  });
});

/**
 * 获取 Agent 推荐的 Skills
 */
router.get('/agent/:agentId', async (req, res) => {
  const { agentId } = req.params;
  const agent = AGENT_SKILLS[agentId];
  
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  // 检查每个 skill 的安装状态
  const skills = await Promise.all(
    agent.skills.map(async (skill) => ({
      ...skill,
      installed: await isSkillInstalled(skill.id)
    }))
  );
  
  res.json({
    agent: agent.name,
    skills
  });
});

/**
 * 安装单个 Skill
 */
router.post('/install/:skillId', async (req, res) => {
  const { skillId } = req.params;
  
  const result = await installSkill(skillId);
  
  res.json({
    skillId,
    ...result
  });
});

/**
 * 为 Agent 安装所有推荐 Skills
 */
router.post('/install-agent/:agentId', async (req, res) => {
  const { agentId } = req.params;
  
  const result = await installAgentSkills(agentId);
  
  res.json({
    agentId,
    ...result
  });
});

/**
 * 根据用户兴趣推荐 Skills
 */
router.post('/recommend', (req, res) => {
  const { interests } = req.body;
  
  if (!interests || !Array.isArray(interests)) {
    return res.status(400).json({ error: 'interests array is required' });
  }
  
  const skills = getRecommendedSkills(interests);
  
  res.json({
    interests,
    recommendedSkills: skills
  });
});

/**
 * 获取已安装的 Skills
 */
router.get('/installed', async (req, res) => {
  const installed = [];
  
  for (const [agentId, agent] of Object.entries(AGENT_SKILLS)) {
    for (const skill of agent.skills) {
      if (await isSkillInstalled(skill.id)) {
        installed.push({
          ...skill,
          agent: agent.name
        });
      }
    }
  }
  
  res.json({
    total: installed.length,
    skills: installed
  });
});

export default router;
