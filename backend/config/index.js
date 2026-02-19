/**
 * 灵犀云统一配置
 * 所有环境变量和默认值集中管理
 */

export const config = {
  // 服务配置
  server: {
    port: parseInt(process.env.PORT || '3000'),
    ip: process.env.SERVER_IP || 'localhost',
  },
  
  // 安全配置
  security: {
    jwtSecret: process.env.JWT_SECRET || 'lingxi-cloud-secret-key-2026',
    adminKey: process.env.ADMIN_KEY || 'lingxi-admin-2026',
  },
  
  // 用户服务器配置
  userServer: {
    password: process.env.USER_SERVER_PASSWORD || 'Lingxi@2026!',
    openclawPort: parseInt(process.env.OPENCLAW_PORT || '18789'),
  },
  
  // OpenClaw 配置
  openclaw: {
    url: process.env.OPENCLAW_URL || 'http://localhost:18789',
    token: process.env.OPENCLAW_TOKEN || '',
    session: process.env.OPENCLAW_SESSION || 'c308f1f0',
    image: process.env.OPENCLAW_IMAGE || 
      'crpi-bcyqkynua4upy5gp.cn-hangzhou.personal.cr.aliyuncs.com/lingxi-cloud2026/lingxi-cloud:latest',
  },
  
  // 阿里云配置
  aliyun: {
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || '',
    region: process.env.ALIYUN_REGION || 'cn-hangzhou',
    zone: process.env.ALIYUN_ZONE || 'cn-hangzhou-h',
    
    // VPC 配置（需要预先创建）
    vpcId: process.env.ALIYUN_VPC_ID || '',
    vSwitchId: process.env.ALIYUN_VSWITCH_ID || '',
    securityGroupId: process.env.ALIYUN_SECURITY_GROUP_ID || '',
    
    // 实例配置
    instanceType: process.env.ALIYUN_INSTANCE_TYPE || 'ecs.g6.large',
    systemDiskSize: parseInt(process.env.ALIYUN_DISK_SIZE || '40'),
    bandwidth: parseInt(process.env.ALIYUN_BANDWIDTH || '5'),
  },
  
  // 运行模式
  mvpMode: process.env.MVP_MODE === 'true',
};

export default config;
