/**
 * Map Lingxi Cloud UI model ids to OpenClaw provider/model refs.
 */
export function resolveOpenClawModel(modelId: string | null | undefined): string {
  const raw = (modelId ?? "").trim();
  if (!raw || raw === "auto") return "lume/auto";

  // Kimi → 9router 直连
  if (raw.startsWith("kimi/")) return `9router/${raw}`;

  // Cursor models in UI use cu/* — OpenClaw expects 9router-sg/cu/*
  if (raw.startsWith("cu/")) return `9router-sg/${raw}`;

  // Already provider-qualified
  if (raw.includes("/")) return raw;

  // Bare ids OpenClaw accepts (e.g. glm-5.2 → zhipu)
  return raw;
}
