// 数据库初始化脚本 - V3 独立数据库
// 用法: node scripts/init-db.mjs
// 需要 DATABASE_URL 环境变量

import { neon } from "@neondatabase/serverless";
import { randomUUID } from "crypto";

if (!process.env.DATABASE_URL) {
  console.log("⚠️  DATABASE_URL not set. Skipping database initialization.");
  console.log("   The app will use in-memory storage as fallback.");
  process.exit(0);
}

const sql = neon(process.env.DATABASE_URL);

async function init() {
  console.log("Initializing V3 database...");

  // 创建所有表
  await sql`
    CREATE TABLE IF NOT EXISTS waybill_snapshots (
      id TEXT PRIMARY KEY, waybill_id TEXT NOT NULL,
      external_code TEXT, store_name TEXT, recipient_name TEXT,
      recipient_phone TEXT, recipient_address TEXT,
      total_amount DECIMAL DEFAULT 0, sku_count INTEGER DEFAULT 0,
      raw_data JSONB DEFAULT '{}', synced_at TIMESTAMPTZ DEFAULT NOW(),
      data_version INTEGER DEFAULT 1
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS api_sync_logs (
      id TEXT PRIMARY KEY, request_id TEXT NOT NULL, api_name TEXT NOT NULL,
      request_params JSONB DEFAULT '{}', response_status INTEGER,
      response_summary TEXT, duration_ms INTEGER DEFAULT 0,
      success BOOLEAN DEFAULT false, error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS exception_tickets (
      id TEXT PRIMARY KEY, ticket_no TEXT NOT NULL UNIQUE,
      waybill_snapshot_id TEXT, exception_type TEXT NOT NULL,
      exception_source TEXT NOT NULL DEFAULT 'manual',
      description TEXT DEFAULT '', amount DECIMAL DEFAULT 0,
      reporter TEXT NOT NULL, reporter_role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', current_level INTEGER DEFAULT 0,
      reject_count INTEGER DEFAULT 0, max_reject_count INTEGER DEFAULT 3,
      timeout_at TIMESTAMPTZ, version INTEGER DEFAULT 1,
      execution_action TEXT, execution_detail TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS approval_records (
      id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, ticket_no TEXT NOT NULL,
      approver TEXT NOT NULL, approver_role TEXT NOT NULL,
      level INTEGER NOT NULL, action TEXT NOT NULL,
      opinion TEXT, triggered_by TEXT NOT NULL DEFAULT 'manual',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS compensation_records (
      id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL,
      approval_record_id TEXT, compensation_direction TEXT NOT NULL,
      amount DECIMAL DEFAULT 0, status TEXT DEFAULT 'pending',
      description TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS inventory_records (
      id TEXT PRIMARY KEY, sku_code TEXT NOT NULL,
      sku_name TEXT, warehouse TEXT DEFAULT 'WH-01',
      quantity INTEGER DEFAULT 0, locked_quantity INTEGER DEFAULT 0,
      available_quantity INTEGER DEFAULT 0, batch_no TEXT,
      status TEXT DEFAULT 'available', updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS scan_records (
      id TEXT PRIMARY KEY, waybill_snapshot_id TEXT,
      external_code TEXT, sku_code TEXT NOT NULL, sku_name TEXT,
      batch_no TEXT, scan_time TIMESTAMPTZ DEFAULT NOW(),
      operator TEXT NOT NULL, device_id TEXT,
      qc_result TEXT NOT NULL DEFAULT 'pass', fail_reason TEXT,
      triggered_rule_id TEXT, triggered_rule_name TEXT,
      batch_status TEXT NOT NULL DEFAULT 'normal', ticket_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS qc_rules (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, exception_sub_type TEXT NOT NULL,
      condition_field TEXT NOT NULL, condition_operator TEXT NOT NULL DEFAULT 'gt',
      condition_value TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'medium',
      auto_create_ticket BOOLEAN DEFAULT true, approval_level INTEGER DEFAULT 1,
      enabled BOOLEAN DEFAULT true, priority INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS app_config (
      id TEXT PRIMARY KEY, config_key TEXT NOT NULL UNIQUE,
      config_value TEXT NOT NULL, description TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  console.log("✅ All tables created successfully");

  // 创建索引
  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_tickets_status ON exception_tickets(status)",
    "CREATE INDEX IF NOT EXISTS idx_tickets_type ON exception_tickets(exception_type)",
    "CREATE INDEX IF NOT EXISTS idx_tickets_reporter ON exception_tickets(reporter)",
    "CREATE INDEX IF NOT EXISTS idx_approvals_ticket ON approval_records(ticket_id)",
    "CREATE INDEX IF NOT EXISTS idx_scans_ticket ON scan_records(ticket_id)",
    "CREATE INDEX IF NOT EXISTS idx_scans_sku ON scan_records(sku_code, batch_no)",
    "CREATE INDEX IF NOT EXISTS idx_sync_logs_request ON api_sync_logs(request_id)",
    "CREATE INDEX IF NOT EXISTS idx_snapshots_waybill ON waybill_snapshots(waybill_id)",
  ];

  for (const idx of indexes) {
    await sql.unsafe(idx);
  }
  console.log("✅ Indexes created");

  // 插入默认品控规则
  const defaultRules = [
    ["数量差异检测", "qc_quantity", "quantity_diff_percent", "gt", "5", "high", 1],
    ["严重数量差异", "qc_quantity", "quantity_diff_percent", "gt", "20", "critical", 2],
    ["外观破损-轻微", "qc_appearance", "damage_level", "gte", "1", "low", 1],
    ["外观破损-严重", "qc_appearance", "damage_level", "gte", "3", "critical", 2],
    ["规格偏差检测", "qc_spec", "spec_deviation", "gt", "0", "medium", 1],
    ["标签错误检测", "qc_label", "label_match", "eq", "false", "medium", 1],
    ["批次异常检测", "qc_batch", "batch_valid", "eq", "false", "high", 2],
  ];

  for (let i = 0; i < defaultRules.length; i++) {
    const [name, subType, field, op, val, sev, level] = defaultRules[i];
    await sql`
      INSERT INTO qc_rules (id, name, exception_sub_type, condition_field, condition_operator, condition_value, severity, auto_create_ticket, approval_level, enabled, priority)
      VALUES (${randomUUID()}, ${name}, ${subType}, ${field}, ${op}, ${val}, ${sev}, true, ${level}, true, ${i})
    `;
  }
  console.log("✅ Default QC rules inserted");

  // 插入默认配置
  const defaultConfigs = [
    ["approval.level2_threshold", "5000", "二级审批金额阈值(元)"],
    ["timeout.pending_hours", "24", "待审批超时(小时)"],
    ["timeout.level1_review_hours", "48", "一级审批超时(小时)"],
    ["timeout.level2_review_hours", "72", "二级审批超时(小时)"],
    ["resubmit.max_reject_count", "3", "最大重新提交次数"],
    ["qc_hold.timeout_hours", "2", "品控暂扣超时(小时)"],
  ];

  for (const [key, value, desc] of defaultConfigs) {
    await sql`
      INSERT INTO app_config (id, config_key, config_value, description)
      VALUES (${randomUUID()}, ${key}, ${value}, ${desc})
      ON CONFLICT (config_key) DO NOTHING
    `;
  }
  console.log("✅ Default configs inserted");
  console.log("🎉 Database initialization complete!");
}

init().catch((err) => {
  console.error("❌ Database initialization failed:", err);
  process.exit(1);
});
