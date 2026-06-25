import { listInstalledSkills, listWorkflows, readWorkflow, writeWorkflow, fetchHealthStatus, listNativeFiles, readNativeFile, sendNativeNotify, } from "./management-api.js";
// health 定时器：只在客户端主动 subscribe 后启动
const healthTimers = new Map();
const HEALTH_INTERVAL_MS = 120_000; // 2 分钟（原来是 30 秒）
export function stopHealthMonitor(userId) {
    const t = healthTimers.get(userId);
    if (t) {
        clearInterval(t);
        healthTimers.delete(userId);
    }
}
export function startHealthMonitor(userId, ws, gatewayApi, send) {
    stopHealthMonitor(userId);
    if (!gatewayApi?.token)
        return;
    const tick = () => {
        if (ws.readyState !== 1)
            return;
        void fetchHealthStatus(gatewayApi)
            .then((payload) => {
            send(ws, {
                type: "event",
                event: "health.status",
                payload,
            });
        })
            .catch(() => { });
    };
    tick(); // 立即推一次
    healthTimers.set(userId, setInterval(tick, HEALTH_INTERVAL_MS));
}
export async function handleManagementMethod(method, params, gatewayApi) {
    switch (method) {
        case "skills.installed":
            return listInstalledSkills();
        case "workflow.list":
            return listWorkflows();
        case "workflow.read": {
            const id = String(params.id ?? params.workflowId ?? "");
            if (!id)
                throw new Error("workflow id required");
            return readWorkflow(id);
        }
        case "workflow.write": {
            const id = String(params.id ?? params.workflowId ?? "");
            const content = String(params.content ?? "");
            if (!id || !content)
                throw new Error("workflow id and content required");
            return writeWorkflow(id, content);
        }
        case "health.subscribe": {
            // 客户端主动订阅 → 启动定时推送（返回当前状态作为 RPC 响应）
            if (!gatewayApi?.token)
                throw new Error("Gateway not configured");
            // 注意：定时器的启动需要 ws + send，由 ws-bridge 在 dispatch 时处理
            // 这里只返回当前状态
            return fetchHealthStatus(gatewayApi);
        }
        case "native.file.list": {
            const dir = String(params.path ?? "~/.openclaw/workspace");
            return listNativeFiles(dir);
        }
        case "native.file.read": {
            const filePath = String(params.path ?? "");
            if (!filePath)
                throw new Error("path required");
            return readNativeFile(filePath);
        }
        case "native.notify": {
            const title = String(params.title ?? "灵犀云");
            const body = String(params.body ?? "");
            return sendNativeNotify(title, body);
        }
        default:
            throw new Error(`Unknown management method: ${method}`);
    }
}
export const MANAGEMENT_METHODS = new Set([
    "skills.installed",
    "workflow.list",
    "workflow.read",
    "workflow.write",
    "health.subscribe",
    "native.file.list",
    "native.file.read",
    "native.notify",
]);
