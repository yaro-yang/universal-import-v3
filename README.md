# 运单全流程管理系统 V3

## 录单 → 扫描品控 → 异常上报 → 分级审批 → 执行联动 —— 运单全生命周期管理

V3 是运单全流程管理平台，独立部署、独立数据库，通过 HTTP API 与 [V2 系统](https://universal-import-v2.vercel.app/) 数据互通。

**在线地址**: https://universal-import-v3.vercel.app/

---

## 目录

- [系统架构](#系统架构)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [功能模块](#功能模块)
- [系统间接口契约](#系统间接口契约)
- [数据库设计](#数据库设计)
- [需求理解与假设说明](#需求理解与假设说明)

---

## 系统架构

```
┌──────────────────────────────────────────────────┐
│                    V2 (已部署)                     │
│          https://universal-import-v2.vercel.app   │
│          AI 录单解析 → 结构化运单数据             │
│                                                   │
│  /api/v2/external/health                          │
│  /api/v2/external/waybills (GET/POST)             │
│  /api/v2/external/waybills/[id] (GET)              │
│  /api/v2/external/verify-sku (POST)               │
└──────────┬───────────────────────────────────────┘
           │ HTTP API (X-API-Key 鉴权)
           ▼
┌──────────────────────────────────────────────────┐
│                    V3 (本项目)                     │
│      独立部署 · 独立数据库 · 运单全流程管理        │
│                                                   │
│  模块零：扫描品控（扫描录入 → 品控规则引擎）       │
│  模块一：异常上报（手工上报 → V2 接口校验运单）    │
│  模块二：分级审批（状态机 → 两级审批 → 超时流转）  │
│  模块三：执行联动（赔付 + 库存 → 一致性保障）     │
│  模块四：工单追踪（列表/详情/审计日志）            │
│  模块五：跨系统监控（接口日志/数据来源标注）        │
└──────────────────────────────────────────────────┘
```

---

## 技术栈

| 项目 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router) |
| 语言 | TypeScript 5.7+ |
| CSS | Tailwind CSS v4 |
| 数据库 | Neon PostgreSQL (Serverless)，无DB时自动降级为内存存储 |
| 部署 | Vercel（独立项目，独立部署） |
| UI 风格 | 鲸天系统：主色 #0fc6c2，圆角卡片，青绿色调 |
| AI（可选） | DeepSeek / OpenAI 兼容接口 |

---

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 DATABASE_URL（可选）和 V2_API_KEY

# 3. 初始化数据库（如果使用 PostgreSQL）
npm run db:init

# 4. 启动开发服务器
npm run dev

# 5. 访问 http://localhost:3000
# 6. 点击"生成模拟数据"创建 220 条测试工单
```

### 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `DATABASE_URL` | Neon/Supabase PostgreSQL 连接串 | 否（无则使用内存存储）|
| `NEXT_PUBLIC_V2_API_URL` | V2 外部接口地址 | 否（默认指向 V2 部署地址）|
| `V2_API_KEY` | V2 接口鉴权 Key | 否（默认值） |
| `AI_API_KEY` | AI 大模型 API Key | 否（可选加分项） |
| `AI_API_URL` | AI 服务地址 | 否 |
| `AI_MODEL` | AI 模型名 | 否 |

---

## 功能模块

### 模块零：扫描品控
- 手工输入 SKU 编码/批次号模拟扫描录入
- 品控规则引擎自动检测（不硬编码，后台可配置）
- 通过 V2 接口校验 SKU 归属
- 品控暂扣：异常批次锁定，禁止出库
- 扫描幂等性：同一批次重复扫描不创建重复工单
- 品控主管误判快速放行（留痕）

### 模块一：异常上报
- 物流类异常手工上报（丢件/破损/拒收/超时/地址错误）
- 调用 V2 接口实时校验运单存在性
- AI 辅助异常类型分类建议（需人工确认）
- 同类型未关闭工单防重复上报

### 模块二：分级审批
- 完整状态机：待审批 → 一级审批 → 二级审批 → 执行中 → 已完成
- 金额阈值可配置（默认 5000 元）
- 拒绝重提（最多 3 次，超限自动关闭）
- 超时自动流转（待审批 24h → 一级 48h → 二级 72h）
- 并发冲突保护（版本号乐观锁）
- 权限边界：上报人不能审批自己的工单，后端接口有校验

### 模块三：执行联动
- 审批通过后自动执行赔付/库存变更
- 物流异常赔付方向 = 赔付客户
- 品控异常赔付方向 = 向供应商追偿
- 赔付记录可追溯回具体审批记录
- 补偿机制：执行失败回滚库存

### 模块四：工单追踪
- 多条件筛选（状态/类型/来源/运单号）
- 分页查询，支持 200+ 条数据流畅交互
- 工单详情：完整状态历史 + 审批审计日志
- 即将超时标记（列表黄底提示）

### 模块五：跨系统监控
- V2 服务健康检查 + 接口调用统计
- 每次跨系统调用生成 Request ID 并写入日志
- 工单详情页标注数据来源（实时获取 vs 本地缓存）
- V2 不可用时降级提示（使用缓存数据并标注时间）

---

## 系统间接口契约

### V2 对外接口（V3 调用）

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/v2/external/health` | GET | 健康检查 |
| `/api/v2/external/waybills/:id` | GET | 获取运单详情 |
| `/api/v2/external/waybills?externalCode=xxx` | GET | 按运单号查询 |
| `/api/v2/external/waybills?page=&pageSize=` | GET | 运单列表查询 |
| `/api/v2/external/verify-sku` | POST | 校验 SKU 归属 |

### 鉴权方式
- 请求头: `X-API-Key: v3-system-api-key-2024`
- 请求头: `X-Request-ID: <uuid>`（链路追踪）

### 超时与重试
- 超时时间: 10 秒
- 重试次数: 2 次（仅 5xx 和网络错误）
- 4xx 不重试（客户端错误）
- 幂等性: Request ID 保证唯一请求可追踪

### V2 不可用降级
- 列表展示使用本地快照缓存（标注"使用本地缓存，同步于 XX 时间"）
- 异常上报的运单真实性校验在 V2 不可用时返回明确错误提示
- V2 恢复后自动恢复，无需人工介入

### 老系统二开意识
如果在实际场景中 V2 原本没有对外接口，新增接口时需注意：
- 接口版本策略：新增 `/api/v2/external/` 路径前缀隔离新接口
- 字段向后兼容：新增字段必须设为可选，不删除已有字段
- 灰度上线：先在测试环境验证，上线后监控错误率
- V2 字段升级时 V3 应对：快照表保存 raw_data 字段，可容忍新增字段；若核心字段类型变更（如 int → decimal），V3 侧通过数据版本号感知并在读取时做兼容转换

---

## 数据库设计

V3 使用独立数据库实例，包含 9 张核心表：

| 表名 | 说明 |
|------|------|
| `waybill_snapshots` | 运单本地快照（从 V2 同步的只读缓存） |
| `api_sync_logs` | 接口同步日志（每次 V2 调用的完整记录） |
| `exception_tickets` | 异常工单（核心业务数据） |
| `approval_records` | 审批记录（审计日志，可追溯） |
| `compensation_records` | 赔付记录（含赔付方向字段） |
| `inventory_records` | 库存记录 |
| `scan_records` | 扫描记录（含批次锁定状态） |
| `qc_rules` | 品控规则（可配置引擎） |
| `app_config` | 系统配置（审批阈值/超时等） |

---

## 部署说明

1. 在 [Vercel](https://vercel.com) 导入此项目
2. 设置环境变量（DATABASE_URL 等）
3. 部署完成后访问 `https://<project-name>.vercel.app`
4. 访问 `/api/init` 初始化数据库
5. 生成模拟数据开始使用

---

## 项目结构

```
src/
├── app/
│   ├── layout.tsx                # 根布局
│   ├── page.tsx                  # 工作台/仪表盘
│   ├── globals.css               # 全局样式
│   ├── scan/page.tsx             # 扫描品控
│   ├── tickets/
│   │   ├── page.tsx              # 工单列表
│   │   ├── new/page.tsx          # 异常上报
│   │   └── [id]/page.tsx         # 工单详情
│   ├── approvals/page.tsx        # 审批中心
│   ├── settings/page.tsx         # 规则配置
│   ├── monitor/page.tsx          # 同步监控
│   └── api/                      # API 路由
│       ├── tickets/              # 工单 CRUD
│       ├── approvals/            # 审批操作
│       ├── scan/                 # 扫描 + 快速放行
│       ├── execution/            # 执行联动
│       ├── qc-rules/             # 品控规则
│       ├── config/               # 系统配置
│       ├── monitor/              # 监控数据
│       ├── mock-data/            # 模拟数据生成
│       ├── cron/check-timeouts/  # 超时检查
│       └── ai-suggest/           # AI 建议
├── components/
│   ├── layout/Navigation.tsx     # 导航栏
│   └── ui/                       # 通用组件
├── lib/
│   ├── db.ts                     # 数据库操作层
│   ├── v2-client.ts              # V2 接口客户端
│   ├── config.ts                 # 系统配置
│   ├── qc-engine.ts              # 品控规则引擎
│   └── utils.ts                  # 工具函数
└── types/index.ts                # 类型定义
```
