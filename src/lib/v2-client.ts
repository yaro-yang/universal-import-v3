// V3 → V2 接口客户端
// 通过 HTTP 接口与已部署的 V2 系统交互
// 包含：鉴权、超时、重试、降级、日志记录

import { v4 as uuidv4 } from "uuid";
import { V2Waybill } from "@/types";
import { DEFAULT_CONFIG } from "./config";

const V2_BASE = DEFAULT_CONFIG.v2Api.baseUrl;
const API_KEY = DEFAULT_CONFIG.v2Api.apiKey;
const TIMEOUT = DEFAULT_CONFIG.v2Api.timeout;
const MAX_RETRIES = DEFAULT_CONFIG.v2Api.retryCount;
const RETRY_DELAY = DEFAULT_CONFIG.v2Api.retryDelay;

interface V2Response<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ===== 日志记录 =====
import { saveApiSyncLog } from "./db";

// ===== 核心 HTTP 封装 =====
async function fetchWithAuth<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null; fromCache?: boolean }> {
  const requestId = uuidv4();
  const startTime = Date.now();
  const fullUrl = `${V2_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY,
    "X-Request-ID": requestId,
    ...((options.headers as Record<string, string>) || {}),
  };

  let lastError: string | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY * attempt));
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
      const response = await fetch(fullUrl, { ...options, headers, signal: controller.signal });
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const errorMsg = `V2 returned ${response.status}: ${body.slice(0, 200)}`;
        if (response.status >= 400 && response.status < 500) {
          await logCall(requestId, path, options, response.status, body.slice(0, 300), durationMs, false, errorMsg);
          return { data: null, error: errorMsg };
        }
        if (attempt < MAX_RETRIES) continue;
        await logCall(requestId, path, options, response.status, body.slice(0, 300), durationMs, false, errorMsg);
        return { data: null, error: errorMsg };
      }

      const result = (await response.json()) as V2Response<T>;
      const finalDuration = Date.now() - startTime;

      if (!result.success || result.error) {
        await logCall(requestId, path, options, response.status, result.error || "Unknown", finalDuration, false, result.error);
        return { data: null, error: result.error || "Unknown error" };
      }

      await logCall(requestId, path, options, response.status, "OK", finalDuration, true);
      return { data: result.data as T, error: null };
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      const errorMsg = isTimeout ? "V2 interface timeout" : (err instanceof Error ? err.message : "Network error");
      lastError = errorMsg;
      if (attempt < MAX_RETRIES) continue;
      const durationMs = Date.now() - startTime;
      await logCall(requestId, path, options, isTimeout ? 408 : 0, errorMsg, durationMs, false, errorMsg);
      return { data: null, error: errorMsg };
    }
  }
  return { data: null, error: lastError || "Unknown error" };
}

async function logCall(
  requestId: string, apiName: string, options: RequestInit,
  responseStatus: number, responseSummary: string,
  durationMs: number, success: boolean, errorMessage?: string
) {
  try {
    await saveApiSyncLog({
      id: uuidv4(), requestId, apiName,
      requestParams: { method: options.method || "GET", path: apiName },
      responseStatus, responseSummary, durationMs, success, errorMessage,
      createdAt: new Date().toISOString(),
    });
  } catch { /* 日志失败不阻塞主流程 */ }
}

// ===== 对外接口 =====

/** 校验运单是否存在 + 获取详情 */
export async function getWaybillDetail(waybillId: string): Promise<{ waybill: V2Waybill | null; error: string | null }> {
  const { data, error } = await fetchWithAuth<V2Waybill>(`/waybills/${encodeURIComponent(waybillId)}`);
  return { waybill: data, error };
}

/** 按运单号查询 */
export async function getWaybillByExternalCode(externalCode: string): Promise<{ waybills: V2Waybill[]; error: string | null }> {
  const { data, error } = await fetchWithAuth<V2Waybill[]>(`/waybills?externalCode=${encodeURIComponent(externalCode)}`);
  return { waybills: data || [], error };
}

/** 查询运单列表 */
export async function listWaybills(params?: {
  externalCode?: string; recipientName?: string; page?: number; pageSize?: number;
}): Promise<{ waybills: V2Waybill[]; total: number; error: string | null }> {
  const parts: string[] = [];
  if (params?.externalCode) parts.push(`externalCode=${encodeURIComponent(params.externalCode)}`);
  if (params?.recipientName) parts.push(`recipientName=${encodeURIComponent(params.recipientName)}`);
  if (params?.page) parts.push(`page=${params.page}`);
  if (params?.pageSize) parts.push(`pageSize=${params.pageSize}`);
  const { data, error } = await fetchWithAuth<{ orders: V2Waybill[]; total: number }>(
    `/waybills${parts.length ? "?" + parts.join("&") : ""}`
  );
  return { waybills: data?.orders || [], total: data?.total || 0, error };
}

/** 校验 SKU 是否归属于指定运单 */
export async function verifySkuBelongsToWaybill(waybillId: string, skuCode: string): Promise<{
  valid: boolean; waybill?: V2Waybill; error?: string;
}> {
  const { data, error } = await fetchWithAuth<{ valid: boolean; waybill?: V2Waybill }>(
    `/verify-sku`, { method: "POST", body: JSON.stringify({ waybillId, skuCode }) }
  );
  if (error) return { valid: false, error };
  return { valid: data?.valid || false, waybill: data?.waybill };
}

/** V2 健康检查 */
export async function checkV2Health(): Promise<{ healthy: boolean; latency: number }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(`${V2_BASE}/health`, { signal: controller.signal, headers: { "X-API-Key": API_KEY } });
    clearTimeout(timeoutId);
    return { healthy: resp.ok, latency: Date.now() - start };
  } catch {
    return { healthy: false, latency: Date.now() - start };
  }
}
