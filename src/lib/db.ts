// V3 独立数据库操作层
// 使用 Neon PostgreSQL (Serverless)，独立于 V2 数据库
// 包含所有 V3 自有表的 CRUD 操作

import { neon } from "@neondatabase/serverless";
import { v4 as uuidv4 } from "uuid";
import {
  WaybillSnapshot, ApiSyncLog, ExceptionTicket, ApprovalRecord,
  CompensationRecord, ScanRecord, QCRule, SystemConfig,
  TicketStatus, TicketListParams, TicketListResult,
} from "@/types";
import { DEFAULT_CONFIG } from "./config";

// ===== 数据库连接 =====
let _sql: ReturnType<typeof neon> | null = null;

function sql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL not configured");
    _sql = neon(url);
  }
  return _sql;
}

// ===== 本地内存存储（无 DATABASE_URL 时的降级方案） =====
// 用于开发演示，生产环境必须配置 DATABASE_URL
class MemoryDB {
  private data: Record<string, Record<string, unknown>[]> = {};

  private ensureTable(table: string) {
    if (!this.data[table]) this.data[table] = [];
  }

  async insert(table: string, record: Record<string, unknown>) {
    this.ensureTable(table);
    this.data[table].push(record);
  }

  async findAll(table: string, filter?: (r: Record<string, unknown>) => boolean): Promise<Record<string, unknown>[]> {
    this.ensureTable(table);
    return filter ? this.data[table].filter(filter) : [...this.data[table]];
  }

  async findOne(table: string, filter: (r: Record<string, unknown>) => boolean): Promise<Record<string, unknown> | null> {
    this.ensureTable(table);
    return this.data[table].find(filter) || null;
  }

  async update(table: string, filter: (r: Record<string, unknown>) => boolean, updates: Record<string, unknown>) {
    this.ensureTable(table);
    const idx = this.data[table].findIndex(filter);
    if (idx >= 0) Object.assign(this.data[table][idx], updates);
  }

  async delete(table: string, filter: (r: Record<string, unknown>) => boolean) {
    this.ensureTable(table);
    this.data[table] = this.data[table].filter((r) => !filter(r));
  }

  async count(table: string, filter?: (r: Record<string, unknown>) => boolean): Promise<number> {
    this.ensureTable(table);
    return filter ? this.data[table].filter(filter).length : this.data[table].length;
  }

  async query(sql: string): Promise<Record<string, unknown>[]> { return []; }
}

let memDb: MemoryDB | null = null;

function isMemoryMode(): boolean {
  return !process.env.DATABASE_URL;
}

async function execQuery<T extends Record<string, unknown>>(
  query: string, params?: unknown[]
): Promise<T[]> {
  if (isMemoryMode()) {
    if (!memDb) memDb = new MemoryDB();
    return (await memDb.query(query)) as unknown as T[];
  }
  try {
    const s = sql();
    return (params ? await s(query, params) : await s(query)) as T[];
  } catch (err) {
    console.error("[DB] Query error:", err);
    return [];
  }
}

async function execOne<T extends Record<string, unknown>>(
  query: string, params?: unknown[]
): Promise<T | null> {
  const rows = await execQuery<T>(query, params);
  return rows[0] || null;
}

// ===== 数据库初始化 =====
export async function initDatabase(): Promise<boolean> {
  if (isMemoryMode()) {
    if (!memDb) memDb = new MemoryDB();
    console.log("[DB] Using memory storage (no DATABASE_URL)");
    return true;
  }

  try {
    const s = sql();
    // 创建核心表
    await s`
      CREATE TABLE IF NOT EXISTS waybill_snapshots (
        id TEXT PRIMARY KEY,
        waybill_id TEXT NOT NULL,
        external_code TEXT,
        store_name TEXT,
        recipient_name TEXT,
        recipient_phone TEXT,
        recipient_address TEXT,
        total_amount DECIMAL DEFAULT 0,
        sku_count INTEGER DEFAULT 0,
        raw_data JSONB DEFAULT '{}',
        synced_at TIMESTAMPTZ DEFAULT NOW(),
        data_version INTEGER DEFAULT 1
      )
    `;

    await s`
      CREATE TABLE IF NOT EXISTS api_sync_logs (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        api_name TEXT NOT NULL,
        request_params JSONB DEFAULT '{}',
        response_status INTEGER,
        response_summary TEXT,
        duration_ms INTEGER DEFAULT 0,
        success BOOLEAN DEFAULT false,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await s`
      CREATE TABLE IF NOT EXISTS exception_tickets (
        id TEXT PRIMARY KEY,
        ticket_no TEXT NOT NULL UNIQUE,
        waybill_snapshot_id TEXT,
        exception_type TEXT NOT NULL,
        exception_source TEXT NOT NULL DEFAULT 'manual',
        description TEXT DEFAULT '',
        amount DECIMAL DEFAULT 0,
        reporter TEXT NOT NULL,
        reporter_role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        current_level INTEGER DEFAULT 0,
        reject_count INTEGER DEFAULT 0,
        max_reject_count INTEGER DEFAULT 3,
        timeout_at TIMESTAMPTZ,
        version INTEGER DEFAULT 1,
        execution_action TEXT,
        execution_detail TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await s`
      CREATE TABLE IF NOT EXISTS approval_records (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        ticket_no TEXT NOT NULL,
        approver TEXT NOT NULL,
        approver_role TEXT NOT NULL,
        level INTEGER NOT NULL,
        action TEXT NOT NULL,
        opinion TEXT,
        triggered_by TEXT NOT NULL DEFAULT 'manual',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await s`
      CREATE TABLE IF NOT EXISTS compensation_records (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        approval_record_id TEXT,
        compensation_direction TEXT NOT NULL,
        amount DECIMAL DEFAULT 0,
        status TEXT DEFAULT 'pending',
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await s`
      CREATE TABLE IF NOT EXISTS inventory_records (
        id TEXT PRIMARY KEY,
        sku_code TEXT NOT NULL,
        sku_name TEXT,
        warehouse TEXT DEFAULT 'WH-01',
        quantity INTEGER DEFAULT 0,
        locked_quantity INTEGER DEFAULT 0,
        available_quantity INTEGER DEFAULT 0,
        batch_no TEXT,
        status TEXT DEFAULT 'available',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await s`
      CREATE TABLE IF NOT EXISTS scan_records (
        id TEXT PRIMARY KEY,
        waybill_snapshot_id TEXT,
        external_code TEXT,
        sku_code TEXT NOT NULL,
        sku_name TEXT,
        batch_no TEXT,
        scan_time TIMESTAMPTZ DEFAULT NOW(),
        operator TEXT NOT NULL,
        device_id TEXT,
        qc_result TEXT NOT NULL DEFAULT 'pass',
        fail_reason TEXT,
        triggered_rule_id TEXT,
        triggered_rule_name TEXT,
        batch_status TEXT NOT NULL DEFAULT 'normal',
        ticket_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await s`
      CREATE TABLE IF NOT EXISTS qc_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        exception_sub_type TEXT NOT NULL,
        condition_field TEXT NOT NULL,
        condition_operator TEXT NOT NULL DEFAULT 'gt',
        condition_value TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'medium',
        auto_create_ticket BOOLEAN DEFAULT true,
        approval_level INTEGER DEFAULT 1,
        enabled BOOLEAN DEFAULT true,
        priority INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await s`
      CREATE TABLE IF NOT EXISTS app_config (
        id TEXT PRIMARY KEY,
        config_key TEXT NOT NULL UNIQUE,
        config_value TEXT NOT NULL,
        description TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // 创建索引
    await s`CREATE INDEX IF NOT EXISTS idx_tickets_status ON exception_tickets(status)`;
    await s`CREATE INDEX IF NOT EXISTS idx_tickets_type ON exception_tickets(exception_type)`;
    await s`CREATE INDEX IF NOT EXISTS idx_tickets_reporter ON exception_tickets(reporter)`;
    await s`CREATE INDEX IF NOT EXISTS idx_approvals_ticket ON approval_records(ticket_id)`;
    await s`CREATE INDEX IF NOT EXISTS idx_scans_ticket ON scan_records(ticket_id)`;
    await s`CREATE INDEX IF NOT EXISTS idx_scans_sku ON scan_records(sku_code, batch_no)`;
    await s`CREATE INDEX IF NOT EXISTS idx_sync_logs_request ON api_sync_logs(request_id)`;
    await s`CREATE INDEX IF NOT EXISTS idx_snapshots_waybill ON waybill_snapshots(waybill_id)`;

    // 插入默认品控规则
    const ruleCount = await execOne<{ cnt: string }>(
      `SELECT COUNT(*) as cnt FROM qc_rules`
    );
    if (ruleCount && parseInt(ruleCount.cnt) === 0) {
      for (let i = 0; i < DEFAULT_CONFIG.qcDefaultRules.length; i++) {
        const r = DEFAULT_CONFIG.qcDefaultRules[i];
        await s`
          INSERT INTO qc_rules (id, name, exception_sub_type, condition_field, condition_operator, condition_value, severity, auto_create_ticket, approval_level, enabled, priority)
          VALUES (${uuidv4()}, ${r.name}, ${r.exceptionSubType}, ${r.conditionField}, ${r.conditionOperator}, ${r.conditionValue}, ${r.severity}, ${r.autoCreateTicket}, ${r.approvalLevel}, true, ${i})
        `;
      }
    }

    // 插入默认配置
    const configCount = await execOne<{ cnt: string }>(
      `SELECT COUNT(*) as cnt FROM app_config`
    );
    if (configCount && parseInt(configCount.cnt) === 0) {
      const configs: [string, string, string][] = [
        ["approval.level2_threshold", "5000", "二级审批金额阈值(元)"],
        ["timeout.pending_hours", "24", "待审批超时(小时)"],
        ["timeout.level1_review_hours", "48", "一级审批超时(小时)"],
        ["timeout.level2_review_hours", "72", "二级审批超时(小时)"],
        ["resubmit.max_reject_count", "3", "最大重新提交次数"],
        ["qc_hold.timeout_hours", "2", "品控暂扣超时(小时)"],
      ];
      for (const [key, value, desc] of configs) {
        await s`
          INSERT INTO app_config (id, config_key, config_value, description)
          VALUES (${uuidv4()}, ${key}, ${value}, ${desc})
        `;
      }
    }

    console.log("[DB] Database initialized successfully");
    return true;
  } catch (err) {
    console.error("[DB] Init error:", err);
    if (!memDb) memDb = new MemoryDB();
    return false;
  }
}

// ===== 运单快照 =====
export async function upsertWaybillSnapshot(snapshot: WaybillSnapshot): Promise<void> {
  if (isMemoryMode()) {
    await memDb!.delete("waybill_snapshots", (r) => r.waybillId === snapshot.waybillId);
    await memDb!.insert("waybill_snapshots", snapshot as unknown as Record<string, unknown>);
    return;
  }
  const s = sql();
  await s`
    INSERT INTO waybill_snapshots (id, waybill_id, external_code, store_name, recipient_name, recipient_phone, recipient_address, total_amount, sku_count, raw_data, synced_at, data_version)
    VALUES (${snapshot.id}, ${snapshot.waybillId}, ${snapshot.externalCode || null}, ${snapshot.storeName || null}, ${snapshot.recipientName || null}, ${snapshot.recipientPhone || null}, ${snapshot.recipientAddress || null}, ${snapshot.totalAmount}, ${snapshot.skuCount}, ${JSON.stringify(snapshot.rawData)}, ${snapshot.syncedAt}, ${snapshot.dataVersion})
    ON CONFLICT (id) DO UPDATE SET
      total_amount = EXCLUDED.total_amount, sku_count = EXCLUDED.sku_count,
      raw_data = EXCLUDED.raw_data, synced_at = EXCLUDED.synced_at, data_version = EXCLUDED.data_version
  `;
}

export async function getWaybillSnapshot(waybillId: string): Promise<WaybillSnapshot | null> {
  if (isMemoryMode()) {
    const r = await memDb!.findOne("waybill_snapshots", (r) => r.waybillId === waybillId);
    return r ? (r as unknown as WaybillSnapshot) : null;
  }
  const row = await execOne<Record<string, unknown>>(
    `SELECT * FROM waybill_snapshots WHERE waybill_id = $1`, [waybillId]
  );
  if (!row) return null;
  return rowToSnapshot(row);
}

function rowToSnapshot(row: Record<string, unknown>): WaybillSnapshot {
  return {
    id: row.id as string, waybillId: row.waybill_id as string,
    externalCode: (row.external_code as string) || undefined,
    storeName: (row.store_name as string) || undefined,
    recipientName: (row.recipient_name as string) || undefined,
    recipientPhone: (row.recipient_phone as string) || undefined,
    recipientAddress: (row.recipient_address as string) || undefined,
    totalAmount: Number(row.total_amount || 0),
    skuCount: Number(row.sku_count || 0),
    rawData: typeof row.raw_data === "string" ? JSON.parse(row.raw_data as string) : (row.raw_data as Record<string, unknown> || {}),
    syncedAt: row.synced_at as string, dataVersion: Number(row.data_version || 1),
  };
}

// ===== API 同步日志 =====
export async function saveApiSyncLog(log: ApiSyncLog): Promise<void> {
  if (isMemoryMode()) {
    await memDb!.insert("api_sync_logs", log as unknown as Record<string, unknown>);
    return;
  }
  const s = sql();
  await s`
    INSERT INTO api_sync_logs (id, request_id, api_name, request_params, response_status, response_summary, duration_ms, success, error_message, created_at)
    VALUES (${log.id}, ${log.requestId}, ${log.apiName}, ${JSON.stringify(log.requestParams)}, ${log.responseStatus || null}, ${log.responseSummary || null}, ${log.durationMs}, ${log.success}, ${log.errorMessage || null}, ${log.createdAt})
  `;
}

export async function getApiSyncLogs(limit = 50): Promise<ApiSyncLog[]> {
  if (isMemoryMode()) {
    const all = await memDb!.findAll("api_sync_logs");
    return all.slice(-limit).reverse() as unknown as ApiSyncLog[];
  }
  const rows = await execQuery<Record<string, unknown>>(
    `SELECT * FROM api_sync_logs ORDER BY created_at DESC LIMIT $1`, [limit]
  );
  return rows.map(rowToLog);
}

function rowToLog(row: Record<string, unknown>): ApiSyncLog {
  return {
    id: row.id as string, requestId: row.request_id as string,
    apiName: row.api_name as string,
    requestParams: typeof row.request_params === "string" ? JSON.parse(row.request_params as string) : (row.request_params as Record<string, unknown> || {}),
    responseStatus: (row.response_status as number) || undefined,
    responseSummary: (row.response_summary as string) || undefined,
    durationMs: Number(row.duration_ms || 0),
    success: Boolean(row.success),
    errorMessage: (row.error_message as string) || undefined,
    createdAt: row.created_at as string,
  };
}

export async function getSyncStats(): Promise<{
  totalCalls: number; successCalls: number; failedCalls: number;
  lastSyncTime: string | null; successRate: number; recentLogs: ApiSyncLog[];
}> {
  if (isMemoryMode()) {
    const all = await memDb!.findAll("api_sync_logs") as unknown as ApiSyncLog[];
    const success = all.filter((l) => l.success).length;
    const recent = all.slice(-50).reverse();
    return {
      totalCalls: all.length, successCalls: success,
      failedCalls: all.length - success,
      lastSyncTime: all.length > 0 ? all[all.length - 1].createdAt : null,
      successRate: all.length > 0 ? Math.round((success / all.length) * 100) : 0,
      recentLogs: recent,
    };
  }
  const stats = await execOne<{ total: string; success: string; last_time: string | null }>(
    `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE success = true) as success, MAX(created_at) as last_time FROM api_sync_logs`
  );
  const recent = await getApiSyncLogs(50);
  const total = Number(stats?.total || 0);
  const successCount = Number(stats?.success || 0);
  return {
    totalCalls: total, successCalls: successCount, failedCalls: total - successCount,
    lastSyncTime: stats?.last_time || null,
    successRate: total > 0 ? Math.round((successCount / total) * 100) : 0,
    recentLogs: recent,
  };
}

// ===== 异常工单 =====
export async function createTicket(ticket: ExceptionTicket): Promise<ExceptionTicket> {
  if (isMemoryMode()) {
    await memDb!.insert("exception_tickets", ticket as unknown as Record<string, unknown>);
    return ticket;
  }
  const s = sql();
  await s`
    INSERT INTO exception_tickets (id, ticket_no, waybill_snapshot_id, exception_type, exception_source, description, amount, reporter, reporter_role, status, current_level, reject_count, max_reject_count, timeout_at, version, execution_action, execution_detail, created_at, updated_at)
    VALUES (${ticket.id}, ${ticket.ticketNo}, ${ticket.waybillSnapshotId || null}, ${ticket.exceptionType}, ${ticket.exceptionSource}, ${ticket.description}, ${ticket.amount}, ${ticket.reporter}, ${ticket.reporterRole}, ${ticket.status}, ${ticket.currentLevel}, ${ticket.rejectCount}, ${ticket.maxRejectCount}, ${ticket.timeoutAt || null}, ${ticket.version}, ${ticket.executionAction || null}, ${ticket.executionDetail || null}, ${ticket.createdAt}, ${ticket.updatedAt})
  `;
  return ticket;
}

export async function getTicket(id: string): Promise<ExceptionTicket | null> {
  if (isMemoryMode()) {
    const r = await memDb!.findOne("exception_tickets", (r) => r.id === id);
    if (!r) return null;
    return enrichTicket(r as unknown as ExceptionTicket);
  }
  const row = await execOne<Record<string, unknown>>(
    `SELECT * FROM exception_tickets WHERE id = $1`, [id]
  );
  if (!row) return null;
  return enrichTicket(rowToTicket(row));
}

export async function getTicketByTicketNo(ticketNo: string): Promise<ExceptionTicket | null> {
  if (isMemoryMode()) {
    const r = await memDb!.findOne("exception_tickets", (r) => r.ticketNo === ticketNo);
    return r ? enrichTicket(r as unknown as ExceptionTicket) : null;
  }
  const row = await execOne<Record<string, unknown>>(
    `SELECT * FROM exception_tickets WHERE ticket_no = $1`, [ticketNo]
  );
  if (!row) return null;
  return enrichTicket(rowToTicket(row));
}

export async function listTickets(params: TicketListParams): Promise<TicketListResult> {
  if (isMemoryMode()) {
    let all = (await memDb!.findAll("exception_tickets")) as unknown as ExceptionTicket[];
    if (params.status) all = all.filter((t) => t.status === params.status);
    if (params.exceptionType) all = all.filter((t) => t.exceptionType === params.exceptionType);
    if (params.exceptionSource) all = all.filter((t) => t.exceptionSource === params.exceptionSource);
    if (params.waybillCode) {
      all = all.filter((t) => {
        const snap = t.waybillSnapshot;
        return snap?.externalCode?.includes(params.waybillCode!) || snap?.waybillId?.includes(params.waybillCode!);
      });
    }
    if (params.reporter) all = all.filter((t) => t.reporter.includes(params.reporter!));
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const total = all.length;
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const start = (page - 1) * pageSize;
    return { tickets: all.slice(start, start + pageSize), total, page, pageSize };
  }

  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (params.status) { conditions.push(`status = $${paramIdx++}`); values.push(params.status); }
  if (params.exceptionType) { conditions.push(`exception_type = $${paramIdx++}`); values.push(params.exceptionType); }
  if (params.exceptionSource) { conditions.push(`exception_source = $${paramIdx++}`); values.push(params.exceptionSource); }
  if (params.reporter) { conditions.push(`reporter ILIKE $${paramIdx++}`); values.push(`%${params.reporter}%`); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const page = params.page || 1;
  const pageSize = params.pageSize || 20;
  const offset = (page - 1) * pageSize;

  const countRow = await execOne<{ cnt: string }>(`SELECT COUNT(*) as cnt FROM exception_tickets ${where}`, values);
  const total = Number(countRow?.cnt || 0);

  const rows = await execQuery<Record<string, unknown>>(
    `SELECT * FROM exception_tickets ${where} ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...values, pageSize, offset]
  );

  const tickets: ExceptionTicket[] = [];
  for (const row of rows) {
    tickets.push(await enrichTicket(rowToTicket(row)));
  }
  return { tickets, total, page, pageSize };
}

export async function updateTicket(id: string, updates: Partial<ExceptionTicket>, expectedVersion?: number): Promise<boolean> {
  if (isMemoryMode()) {
    const ticket = await memDb!.findOne("exception_tickets", (r) => r.id === id);
    if (!ticket) return false;
    if (expectedVersion !== undefined && (ticket as unknown as ExceptionTicket).version !== expectedVersion) return false;
    await memDb!.update("exception_tickets", (r) => r.id === id, { ...updates, version: ((ticket as unknown as ExceptionTicket).version || 0) + 1, updatedAt: new Date().toISOString() } as Record<string, unknown>);
    return true;
  }

  const s = sql();
  const setClauses: string[] = [];
  const values: unknown[] = [id];
  let idx = 2;

  const fieldMap: Record<string, string> = {
    status: "status", currentLevel: "current_level", rejectCount: "reject_count",
    timeoutAt: "timeout_at", version: "version", executionAction: "execution_action",
    executionDetail: "execution_detail", amount: "amount",
  };

  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in updates) {
      setClauses.push(`${col} = $${idx++}`);
      values.push((updates as Record<string, unknown>)[key]);
    }
  }
  setClauses.push(`updated_at = NOW()`);

  if (expectedVersion !== undefined) {
    setClauses.push(`version = version + 1`);
    values.push(expectedVersion);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (s as any)`UPDATE exception_tickets SET ${(s as any).unsafe(setClauses.join(", "))} WHERE id = $1 AND version = $${idx} RETURNING id`;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (s as any)`UPDATE exception_tickets SET ${(s as any).unsafe(setClauses.join(", "))} WHERE id = $1`;
  }
  return true;
}

function rowToTicket(row: Record<string, unknown>): ExceptionTicket {
  return {
    id: row.id as string, ticketNo: row.ticket_no as string,
    waybillSnapshotId: (row.waybill_snapshot_id as string) || undefined,
    exceptionType: row.exception_type as ExceptionTicket["exceptionType"],
    exceptionSource: row.exception_source as ExceptionTicket["exceptionSource"],
    description: (row.description as string) || "",
    amount: Number(row.amount || 0),
    reporter: row.reporter as string, reporterRole: row.reporter_role as string,
    status: row.status as TicketStatus,
    currentLevel: Number(row.current_level || 0),
    rejectCount: Number(row.reject_count || 0),
    maxRejectCount: Number(row.max_reject_count || 3),
    timeoutAt: (row.timeout_at as string) || undefined,
    version: Number(row.version || 1),
    executionAction: (row.execution_action as ExceptionTicket["executionAction"]) || undefined,
    executionDetail: (row.execution_detail as string) || undefined,
    createdAt: row.created_at as string, updatedAt: row.updated_at as string,
  };
}

async function enrichTicket(ticket: ExceptionTicket): Promise<ExceptionTicket> {
  // 加载关联数据
  if (ticket.waybillSnapshotId) {
    const snap = await getWaybillSnapshot(ticket.waybillSnapshotId);
    if (snap) ticket.waybillSnapshot = snap;
  }
  ticket.approvalRecords = await getApprovalRecords(ticket.id);
  ticket.compensationRecord = await getCompensationRecord(ticket.id);
  return ticket;
}

// ===== 审批记录 =====
export async function createApprovalRecord(record: ApprovalRecord): Promise<void> {
  if (isMemoryMode()) {
    await memDb!.insert("approval_records", record as unknown as Record<string, unknown>);
    return;
  }
  const s = sql();
  await s`
    INSERT INTO approval_records (id, ticket_id, ticket_no, approver, approver_role, level, action, opinion, triggered_by, created_at)
    VALUES (${record.id}, ${record.ticketId}, ${record.ticketNo}, ${record.approver}, ${record.approverRole}, ${record.level}, ${record.action}, ${record.opinion || null}, ${record.triggeredBy}, ${record.createdAt})
  `;
}

export async function getApprovalRecords(ticketId: string): Promise<ApprovalRecord[]> {
  if (isMemoryMode()) {
    const all = await memDb!.findAll("approval_records", (r) => r.ticketId === ticketId);
    return all as unknown as ApprovalRecord[];
  }
  const rows = await execQuery<Record<string, unknown>>(
    `SELECT * FROM approval_records WHERE ticket_id = $1 ORDER BY created_at ASC`, [ticketId]
  );
  return rows.map((r) => ({
    id: r.id as string, ticketId: r.ticket_id as string, ticketNo: r.ticket_no as string,
    approver: r.approver as string, approverRole: r.approver_role as string,
    level: Number(r.level), action: r.action as ApprovalRecord["action"],
    opinion: (r.opinion as string) || undefined,
    triggeredBy: r.triggered_by as ApprovalRecord["triggeredBy"],
    createdAt: r.created_at as string,
  }));
}

// ===== 赔付记录 =====
export async function createCompensationRecord(record: CompensationRecord): Promise<void> {
  if (isMemoryMode()) {
    await memDb!.insert("compensation_records", record as unknown as Record<string, unknown>);
    return;
  }
  const s = sql();
  await s`
    INSERT INTO compensation_records (id, ticket_id, approval_record_id, compensation_direction, amount, status, description, created_at)
    VALUES (${record.id}, ${record.ticketId}, ${record.approvalRecordId || null}, ${record.compensationDirection}, ${record.amount}, ${record.status}, ${record.description || null}, ${record.createdAt})
  `;
}

export async function getCompensationRecord(ticketId: string): Promise<CompensationRecord | undefined> {
  if (isMemoryMode()) {
    const r = await memDb!.findOne("compensation_records", (r) => r.ticketId === ticketId);
    return r as unknown as CompensationRecord | undefined;
  }
  const row = await execOne<Record<string, unknown>>(
    `SELECT * FROM compensation_records WHERE ticket_id = $1 LIMIT 1`, [ticketId]
  );
  if (!row) return undefined;
  return {
    id: row.id as string, ticketId: row.ticket_id as string,
    approvalRecordId: (row.approval_record_id as string) || undefined,
    compensationDirection: row.compensation_direction as CompensationRecord["compensationDirection"],
    amount: Number(row.amount), status: row.status as "pending" | "processed",
    description: (row.description as string) || undefined,
    createdAt: row.created_at as string,
  };
}

// ===== 扫描记录 =====
export async function createScanRecord(record: ScanRecord): Promise<void> {
  if (isMemoryMode()) {
    await memDb!.insert("scan_records", record as unknown as Record<string, unknown>);
    return;
  }
  const s = sql();
  await s`
    INSERT INTO scan_records (id, waybill_snapshot_id, external_code, sku_code, sku_name, batch_no, scan_time, operator, device_id, qc_result, fail_reason, triggered_rule_id, triggered_rule_name, batch_status, ticket_id, created_at)
    VALUES (${record.id}, ${record.waybillSnapshotId || null}, ${record.externalCode || null}, ${record.skuCode}, ${record.skuName || null}, ${record.batchNo || null}, ${record.scanTime}, ${record.operator}, ${record.deviceId || null}, ${record.qcResult}, ${record.failReason || null}, ${record.triggeredRuleId || null}, ${record.triggeredRuleName || null}, ${record.batchStatus}, ${record.ticketId || null}, ${record.createdAt})
  `;
}

export async function getScanRecords(params: {
  skuCode?: string; batchNo?: string; externalCode?: string; ticketId?: string; limit?: number;
}): Promise<ScanRecord[]> {
  if (isMemoryMode()) {
    let all = await memDb!.findAll("scan_records") as unknown as ScanRecord[];
    if (params.skuCode) all = all.filter((r) => r.skuCode === params.skuCode);
    if (params.batchNo) all = all.filter((r) => r.batchNo === params.batchNo);
    if (params.externalCode) all = all.filter((r) => r.externalCode === params.externalCode);
    if (params.ticketId) all = all.filter((r) => r.ticketId === params.ticketId);
    return all.slice(0, params.limit || 100);
  }
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (params.skuCode) { conditions.push(`sku_code = $${idx++}`); values.push(params.skuCode); }
  if (params.batchNo) { conditions.push(`batch_no = $${idx++}`); values.push(params.batchNo); }
  if (params.externalCode) { conditions.push(`external_code = $${idx++}`); values.push(params.externalCode); }
  if (params.ticketId) { conditions.push(`ticket_id = $${idx++}`); values.push(params.ticketId); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await execQuery<Record<string, unknown>>(
    `SELECT * FROM scan_records ${where} ORDER BY created_at DESC LIMIT $${idx}`, [...values, params.limit || 100]
  );
  return rows.map((r) => ({
    id: r.id as string, waybillSnapshotId: (r.waybill_snapshot_id as string) || undefined,
    externalCode: (r.external_code as string) || undefined,
    skuCode: r.sku_code as string, skuName: (r.sku_name as string) || undefined,
    batchNo: (r.batch_no as string) || undefined,
    scanTime: r.scan_time as string, operator: r.operator as string, deviceId: (r.device_id as string) || undefined,
    qcResult: r.qc_result as ScanRecord["qcResult"],
    failReason: (r.fail_reason as string) || undefined,
    triggeredRuleId: (r.triggered_rule_id as string) || undefined,
    triggeredRuleName: (r.triggered_rule_name as string) || undefined,
    batchStatus: r.batch_status as ScanRecord["batchStatus"],
    ticketId: (r.ticket_id as string) || undefined,
    createdAt: r.created_at as string,
  }));
}

export async function hasOpenQCTicket(skuCode: string, batchNo?: string): Promise<{ hasOpen: boolean; ticketId?: string }> {
  if (isMemoryMode()) {
    const all = await memDb!.findAll("scan_records") as unknown as ScanRecord[];
    const openScan = all.find((r) => r.skuCode === skuCode && r.batchNo === batchNo && r.qcResult === "fail" && r.ticketId);
    if (openScan) {
      const ticket = await memDb!.findOne("exception_tickets", (r) => r.id === openScan.ticketId);
      if (ticket && !["completed", "rejected_final"].includes((ticket as unknown as ExceptionTicket).status)) {
        return { hasOpen: true, ticketId: openScan.ticketId };
      }
    }
    return { hasOpen: false };
  }
  const row = await execOne<{ ticket_id: string; status: string }>(
    `SELECT s.ticket_id, t.status FROM scan_records s
     LEFT JOIN exception_tickets t ON s.ticket_id = t.id
     WHERE s.sku_code = $1 AND s.batch_no = $2 AND s.qc_result = 'fail'
     AND t.status NOT IN ('completed', 'rejected_final')
     LIMIT 1`,
    [skuCode, batchNo || null]
  );
  if (row) return { hasOpen: true, ticketId: row.ticket_id };
  return { hasOpen: false };
}

export async function updateScanBatchStatus(ticketId: string, status: string): Promise<void> {
  if (isMemoryMode()) {
    await memDb!.update("scan_records", (r) => r.ticketId === ticketId, { batchStatus: status });
    return;
  }
  const s = sql();
  await s`UPDATE scan_records SET batch_status = ${status} WHERE ticket_id = ${ticketId}`;
}

// ===== 品控规则 =====
export async function getQCRules(): Promise<QCRule[]> {
  if (isMemoryMode()) {
    return (await memDb!.findAll("qc_rules")) as unknown as QCRule[];
  }
  const rows = await execQuery<Record<string, unknown>>(
    `SELECT * FROM qc_rules WHERE enabled = true ORDER BY priority ASC`
  );
  return rows.map((r) => ({
    id: r.id as string, name: r.name as string, exceptionSubType: r.exception_sub_type as QCRule["exceptionSubType"],
    conditionField: r.condition_field as string, conditionOperator: r.condition_operator as QCRule["conditionOperator"],
    conditionValue: r.condition_value as string, severity: r.severity as QCRule["severity"],
    autoCreateTicket: Boolean(r.auto_create_ticket), approvalLevel: Number(r.approval_level),
    enabled: Boolean(r.enabled), priority: Number(r.priority),
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  }));
}

export async function createQCRule(rule: QCRule): Promise<void> {
  if (isMemoryMode()) {
    await memDb!.insert("qc_rules", rule as unknown as Record<string, unknown>);
    return;
  }
  const s = sql();
  await s`
    INSERT INTO qc_rules (id, name, exception_sub_type, condition_field, condition_operator, condition_value, severity, auto_create_ticket, approval_level, enabled, priority, created_at, updated_at)
    VALUES (${rule.id}, ${rule.name}, ${rule.exceptionSubType}, ${rule.conditionField}, ${rule.conditionOperator}, ${rule.conditionValue}, ${rule.severity}, ${rule.autoCreateTicket}, ${rule.approvalLevel}, ${rule.enabled}, ${rule.priority}, ${rule.createdAt}, ${rule.updatedAt})
  `;
}

export async function deleteQCRule(id: string): Promise<void> {
  if (isMemoryMode()) {
    await memDb!.delete("qc_rules", (r) => r.id === id);
    return;
  }
  const s = sql();
  await s`DELETE FROM qc_rules WHERE id = ${id}`;
}

// ===== 系统配置 =====
export async function getConfig(key: string): Promise<string | null> {
  if (isMemoryMode()) {
    const r = await memDb!.findOne("app_config", (r) => r.configKey === key);
    return r ? (r.configValue as string) : null;
  }
  const row = await execOne<{ config_value: string }>(
    `SELECT config_value FROM app_config WHERE config_key = $1`, [key]
  );
  return row?.config_value || null;
}

export async function setConfig(key: string, value: string, description?: string): Promise<void> {
  if (isMemoryMode()) {
    await memDb!.delete("app_config", (r) => r.configKey === key);
    await memDb!.insert("app_config", { id: uuidv4(), configKey: key, configValue: value, description, updatedAt: new Date().toISOString() });
    return;
  }
  const s = sql();
  await s`
    INSERT INTO app_config (id, config_key, config_value, description, updated_at)
    VALUES (${uuidv4()}, ${key}, ${value}, ${description || null}, NOW())
    ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value, description = EXCLUDED.description, updated_at = NOW()
  `;
}

export async function getAllConfigs(): Promise<SystemConfig[]> {
  if (isMemoryMode()) {
    return (await memDb!.findAll("app_config")) as unknown as SystemConfig[];
  }
  const rows = await execQuery<Record<string, unknown>>(`SELECT * FROM app_config ORDER BY config_key`);
  return rows.map((r) => ({
    id: r.id as string, configKey: r.config_key as string,
    configValue: r.config_value as string,
    description: (r.description as string) || undefined,
    updatedAt: r.updated_at as string,
  }));
}

// ===== 库存 =====
export async function updateInventory(
  skuCode: string, quantityChange: number, lockedChange: number = 0
): Promise<void> {
  if (isMemoryMode()) {
    const existing = await memDb!.findOne("inventory_records", (r) => r.skuCode === skuCode);
    if (existing) {
      await memDb!.update("inventory_records", (r) => r.skuCode === skuCode, {
        quantity: (existing.quantity as number) + quantityChange,
        lockedQuantity: (existing.lockedQuantity as number) + lockedChange,
        availableQuantity: (existing.quantity as number) + quantityChange - ((existing.lockedQuantity as number) + lockedChange),
        updatedAt: new Date().toISOString(),
      });
    }
    return;
  }
  const s = sql();
  await s`
    UPDATE inventory_records
    SET quantity = quantity + ${quantityChange},
        locked_quantity = locked_quantity + ${lockedChange},
        available_quantity = quantity + ${quantityChange} - (locked_quantity + ${lockedChange}),
        updated_at = NOW()
    WHERE sku_code = ${skuCode}
  `;
}

export async function lockInventory(skuCode: string, batchNo?: string): Promise<void> {
  if (isMemoryMode()) {
    await memDb!.update("inventory_records", (r) => r.skuCode === skuCode && r.batchNo === batchNo, { status: "qc_hold" });
    return;
  }
  const s = sql();
  await s`UPDATE inventory_records SET status = 'qc_hold', locked_quantity = quantity, available_quantity = 0, updated_at = NOW() WHERE sku_code = ${skuCode} AND batch_no = ${batchNo || null}`;
}

export async function unlockInventory(skuCode: string, batchNo?: string): Promise<void> {
  if (isMemoryMode()) {
    await memDb!.update("inventory_records", (r) => r.skuCode === skuCode && r.batchNo === batchNo, { status: "available", lockedQuantity: 0 });
    return;
  }
  const s = sql();
  await s`UPDATE inventory_records SET status = 'available', locked_quantity = 0, available_quantity = quantity, updated_at = NOW() WHERE sku_code = ${skuCode} AND batch_no = ${batchNo || null}`;
}

// ===== 超时工单查询 =====
export async function getTimeoutTickets(): Promise<ExceptionTicket[]> {
  if (isMemoryMode()) {
    const all = await memDb!.findAll("exception_tickets") as unknown as ExceptionTicket[];
    const now = new Date();
    return all.filter((t) => t.timeoutAt && new Date(t.timeoutAt) < now && !["completed", "rejected_final", "executing"].includes(t.status));
  }
  const rows = await execQuery<Record<string, unknown>>(
    `SELECT * FROM exception_tickets WHERE timeout_at IS NOT NULL AND timeout_at < NOW() AND status NOT IN ('completed', 'rejected_final', 'executing')`
  );
  return rows.map(rowToTicket);
}
