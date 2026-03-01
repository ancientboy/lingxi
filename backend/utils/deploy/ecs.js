/**
 * 阿里云 ECS 工具
 * 创建和管理 ECS 实例
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Ecs = require('@alicloud/ecs20140526');
const $OpenApi = require('@alicloud/openapi-client');
import { config } from '../../config/index.js';

/**
 * 创建 ECS 客户端
 */
export function createEcsClient() {
  const openApiConfig = new $OpenApi.Config({
    accessKeyId: config.aliyun.accessKeyId,
    accessKeySecret: config.aliyun.accessKeySecret,
  });
  openApiConfig.endpoint = 'ecs.aliyuncs.com';
  
  return new Ecs(openApiConfig);
}

/**
 * 创建 ECS 实例
 */
export async function createEcsInstance(client, options) {
  const {
    instanceName,
    instanceType = config.aliyun.instanceType,
    regionId = config.aliyun.region,
    zoneId = config.aliyun.zone,
    vpcId = config.aliyun.vpcId,
    vSwitchId = config.aliyun.vSwitchId,
    securityGroupId = config.aliyun.securityGroupId,
    systemDiskSize = config.aliyun.systemDiskSize,
    bandwidth = config.aliyun.bandwidth,
    password
  } = options;
  
  // 创建实例请求
  const request = new Ecs.CreateInstanceRequest({
    regionId,
    zoneId,
    instanceType,
    instanceName,
    imageId: 'ubuntu_22_04_x64_20G_alibase_20230208.vhd',
    securityGroupId,
    vSwitchId,
    instanceChargeType: 'PostPaid',
    internetChargeType: 'PayByTraffic',
    internetMaxBandwidthOut: bandwidth,
    systemDiskCategory: 'cloud_essd',
    systemDiskSize,
    password
  });
  
  const response = await client.createInstance(request);
  return response.body.instanceId;
}

/**
 * 启动实例
 */
export async function startInstance(client, instanceId, regionId = config.aliyun.region) {
  const request = new Ecs.StartInstanceRequest({
    instanceId,
    regionId
  });
  
  await client.startInstance(request);
}

/**
 * 获取实例公网 IP
 */
export async function getInstancePublicIp(client, instanceId, regionId = config.aliyun.region) {
  const request = new Ecs.DescribeInstancesRequest({
    regionId,
    instanceIds: JSON.stringify([instanceId])
  });
  
  const response = await client.describeInstances(request);
  const instances = response.body.instances.instance;
  
  if (instances && instances.length > 0) {
    return instances[0].publicIpAddress.ipAddress[0];
  }
  
  return null;
}

/**
 * 释放实例
 */
export async function releaseInstance(client, instanceId, regionId = config.aliyun.region) {
  const request = new Ecs.DeleteInstanceRequest({
    instanceId,
    regionId,
    force: true
  });
  
  await client.deleteInstance(request);
}

export default {
  createEcsClient,
  createEcsInstance,
  startInstance,
  getInstancePublicIp,
  releaseInstance
};
