# V3 → V2 系统间接口文档

## 概述

V3 运单全流程管理系统通过 HTTP API 与 [V2 万能导入系统](https://universal-import-v2.vercel.app/) 进行数据交互。V3 不直连 V2 数据库，所有运单数据通过接口获取。

- **基础路径**：`https://universal-import-v2.vercel.app/api/v2/external`
- **鉴权方式**：API Key（通过 `X-API-Key` 请求头传递）
- **请求格式**：JSON
- **响应格式**：`{ success: boolean, data?: any, error?: string }`

---

## 接口列表

### 1. 健康检查

验证 V2 服务是否可用。

```
GET /api/v2/external/health
```

**请求头：**
```
X-API-Key: v3-system-api-key-2024
```

**成功响应 (200)：**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-07-06T08:00:00Z"
  }
}
```

---

### 2. 获取运单详情

通过运单 ID 获取完整运单信息（含 SKU 明细）。

```
GET /api/v2/external/waybills/:id
```

**路径参数：**
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | string | 是 | V2 运单 ID（outbound_orders.id） |

**请求头：**
```
X-API-Key: v3-system-api-key-2024
X-Request-ID: uuid-v4
```

**成功响应 (200)：**
```json
{
  "success": true,
  "data": {
    "id": "out_xxx",
    "externalCode": "PS2512220005001",
    "storeName": "龙湖天街店",
    "recipientName": "张三",
    "recipientPhone": "13800138000",
    "recipientAddress": "海口市龙华区",
    "status": "submitted",
    "items": [
      {
        "id": "item_xxx",
        "skuCode": "SKU001",
        "skuName": "商品A",
        "skuQuantity": 10,
        "skuSpec": "500g"
      }
    ],
    "createdAt": "2026-07-01T10:00:00Z"
  }
}
```

**错误响应 (404)：**
```json
{
  "success": false,
  "error": "Waybill not found"
}
```

---

### 3. 查询运单列表

按条件查询运单列表，支持分页。

```
GET /api/v2/external/waybills?externalCode=xxx&recipientName=xxx&page=1&pageSize=20
```

**查询参数：**
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| externalCode | string | 否 | - | 运单号（精确匹配） |
| recipientName | string | 否 | - | 收件人姓名（模糊匹配） |
| page | number | 否 | 1 | 页码 |
| pageSize | number | 否 | 20 | 每页条数 |

**请求头：**
```
X-API-Key: v3-system-api-key-2024
X-Request-ID: uuid-v4
```

**成功响应 (200)：**
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "out_xxx",
        "externalCode": "PS2512220005001",
        "storeName": "门店A",
        "recipientName": "张三",
        "items": [...],
        "createdAt": "2026-07-01T10:00:00Z"
      }
    ],
    "total": 150
  }
}
```

---

### 4. 校验 SKU 是否归属指定运单

用于扫描录入时验证 SKU 确实在该运单的明细中。

```
POST /api/v2/external/verify-sku
```

**请求体：**
```json
{
  "waybillId": "out_xxx",
  "skuCode": "SKU001"
}
```

**成功响应 (200)：**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "waybill": { ... }
  }
}
```

**运单不存在 (404)：**
```json
{
  "success": false,
  "error": "Waybill not found"
}
```

---

## 鉴权与安全

- 所有 V2 外部接口使用 API Key 鉴权
- API Key 通过 `X-API-Key` 请求头传递
- 默认 Key：`v3-system-api-key-2024`（可通过 `V2_API_KEY` 环境变量配置）
- 每次请求携带 `X-Request-ID`（UUID v4），用于全链路追踪

---

## 超时与重试策略

| 参数 | 值 | 说明 |
|---|---|---|
| 连接超时 | 10 秒 | 超过 10 秒未响应视为超时 |
| 重试次数 | 2 次 | 超时或 5xx 错误时重试，总计最多 3 次尝试 |
| 重试间隔 | 1 秒递增 | 第 1 次重试等 1 秒，第 2 次等 2 秒 |
| 不重试情况 | 4xx 错误 | 客户端错误（如 401 未授权、404 不存在）不重试 |

**幂等性保证：**
- GET 请求天然幂等
- POST `/verify-sku` 是查询类操作，重复调用不产生副作用
- 每次重试使用相同的 `X-Request-ID`，便于服务端去重

---

## V2 不可用时的降级方案

### 降级策略

当 V2 服务整体不可用（健康检查失败或连续超时）：

| 操作 | 降级行为 |
|---|---|
| 异常上报 | 提示「V2 服务暂不可用，无法校验运单，请稍后重试」，**拒绝创建工单**（关键操作必须有实时校验） |
| 扫描录入 | 若未填运单号则允许离线品控检测（不做 SKU 归属校验）；若填了运单号则提示「无法校验 SKU 归属，请稍后重试」 |
| 工单列表 | 使用本地快照表数据，**明确标注**「数据来源：本地缓存，同步于 XX 时间，可能非最新」 |
| 工单详情 | 展示本地快照的运单信息，标注缓存时间和数据来源 |
| 监控页面 | 展示 V2 健康状态为「不可用」，显示降级模式标识 |

### 恢复机制
- 监控页面可手动点击刷新检查 V2 健康状态
- V2 恢复后，下一次操作自动恢复正常模式
- 降级期间被拒绝的操作需要操作人重新发起
- 无需人工介入修复

---

## 数据新鲜度与一致性

### 同步机制

| 场景 | 策略 | 说明 |
|---|---|---|
| 异常上报 | 实时拉取 V2 最新数据 | 关键操作必须校验真实运单，并刷新本地快照 |
| 扫描录入 | 实时拉取 + SKU 归属校验（如填运单号） | 确保扫描的是真实 SKU |
| 工单列表 | 使用本地快照（缓存 TTL 1 小时） | 性能优化，减少 V2 压力 |
| 工单详情 | 使用本地快照 + 标注来源 | 显示缓存时间和数据来源 |

### 边界情况处理

**V2 运单信息在异常处理期间发生变更（如金额更正）：**
- V3 工单创建时保存运单快照到 `waybill_snapshots` 表
- 审批关键节点（审批通过后执行前）可再次校验运单金额
- 若发现金额差异 > 20%，暂停执行并标记「需人工确认」
- 差异通过接口同步日志可追溯

---

## 可观测性

### 接口同步日志

每次跨系统调用记录到 `api_sync_logs` 表：

| 字段 | 说明 |
|---|---|
| request_id | 唯一请求 ID（UUID v4），可追踪完整调用链 |
| api_name | 调用的接口路径 |
| request_params | 请求参数摘要（方法 + 路径） |
| response_status | HTTP 状态码 |
| response_summary | 响应摘要（成功为「OK」，失败为错误信息） |
| duration_ms | 调用耗时（毫秒） |
| success | 是否成功 |
| error_message | 详细错误信息（如有） |

### 监控页面

V3 提供 `/monitor` 页面，展示：
- V2 服务健康状态（正常/不可用）与延迟
- 总调用次数、成功率
- 最近同步时间
- 最近 50 条调用日志（含 Request ID、状态码、耗时）

---

## 老系统二开意识

### 如果 V2 原本没有对外接口

1. **接口版本策略**：新增 `/api/v2/external/` 路径前缀，与 V2 内部 API 隔离
2. **字段向后兼容**：新增字段必须设为可选（nullable），不修改已有字段类型
3. **灰度上线方案**：
   - Phase 1：接口部署到 V2 测试环境，V3 对接测试
   - Phase 2：接口部署到 V2 生产环境，V3 切换生产接口
   - Phase 3：监控错误率，确保不影响 V2 现有调用方

### V2 接口字段升级时 V3 的应对

- V3 快照表 `raw_data` 字段（JSONB）可容忍 V2 新增字段
- 若 V2 核心字段类型变更（如 `amount` int → decimal），V3 通过 `data_version` 感知并在读取快照时做兼容转换
- 建立接口变更通知机制，V2 字段变更时提前通知 V3 维护者
