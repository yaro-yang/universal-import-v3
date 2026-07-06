// ============================================================
// V3 运单全流程管理系统 - 类型定义
// 独立于 V2 的完整类型系统
// ============================================================

// ===== V2 运单相关类型（从 V2 接口获取的数据结构） =====
export interface V2WaybillItem {
  id: string;
  outboundOrderId?: string;
  skuCode: string;
  skuName: string;
  skuQuantity: number;
  skuSpec?: string;
  sourceRow?: number;
}

export interface V2Waybill {
  id: string;
  externalCode?: string;
  storeName?: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientAddress?: string;
  remark?: string;
  status: string;
  items: V2WaybillItem[];
  createdAt: string;
  submittedAt?: string;
}

// ===== 异常类型 =====
export type ExceptionType =
  | "lost" | "damaged" | "rejected" | "timeout" | "address_error"
  | "qc_quantity" | "qc_appearance" | "qc_spec" | "qc_label" | "qc_batch";

export const EXCEPTION_TYPE_LABELS: Record<ExceptionType, string> = {
  lost: "丢件", damaged: "破损", rejected: "客户拒收",
  timeout: "超时未签收", address_error: "收货地址错误",
  qc_quantity: "数量不符", qc_appearance: "外观破损",
  qc_spec: "规格不符", qc_label: "标签错误", qc_batch: "批次异常",
};

export const LOGISTICS_EXCEPTION_TYPES: ExceptionType[] = ["lost", "damaged", "rejected", "timeout", "address_error"];
export const QC_EXCEPTION_TYPES: ExceptionType[] = ["qc_quantity", "qc_appearance", "qc_spec", "qc_label", "qc_batch"];

export type ExceptionSource = "manual" | "scan_trigger";
export type TicketStatus = "pending" | "level1_review" | "level2_review" | "executing" | "completed" | "rejected_final";

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  pending: "待审批", level1_review: "一级审批中", level2_review: "二级审批中",
  executing: "执行中", completed: "已完成", rejected_final: "已驳回",
};

export type ApprovalAction = "approve" | "reject" | "escalate";
export type ApprovalTrigger = "manual" | "auto_timeout" | "auto_escalation";
export type CompensationDirection = "to_customer" | "from_supplier";
export type BatchStatus = "normal" | "qc_hold" | "released";
export type QCResult = "pass" | "fail";

export type ExecutionAction =
  | "release" | "return_supplier" | "repurchase" | "downgrade"
  | "claim" | "resend" | "return_warehouse";

// ===== 数据模型 =====

export interface WaybillSnapshot {
  id: string;
  waybillId: string;
  externalCode?: string;
  storeName?: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientAddress?: string;
  totalAmount: number;
  skuCount: number;
  rawData: Record<string, unknown>;
  syncedAt: string;
  dataVersion: number;
}

export interface ApiSyncLog {
  id: string;
  requestId: string;
  apiName: string;
  requestParams: Record<string, unknown>;
  responseStatus?: number;
  responseSummary?: string;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  createdAt: string;
}

export interface ExceptionTicket {
  id: string;
  ticketNo: string;
  waybillSnapshotId?: string;
  waybillSnapshot?: WaybillSnapshot;
  exceptionType: ExceptionType;
  exceptionSource: ExceptionSource;
  description: string;
  amount: number;
  reporter: string;
  reporterRole: string;
  status: TicketStatus;
  currentLevel: number;
  rejectCount: number;
  maxRejectCount: number;
  timeoutAt?: string;
  version: number;
  approvalRecords?: ApprovalRecord[];
  compensationRecord?: CompensationRecord;
  executionAction?: ExecutionAction;
  executionDetail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRecord {
  id: string;
  ticketId: string;
  ticketNo: string;
  approver: string;
  approverRole: string;
  level: number;
  action: ApprovalAction;
  opinion?: string;
  triggeredBy: ApprovalTrigger;
  createdAt: string;
}

export interface CompensationRecord {
  id: string;
  ticketId: string;
  approvalRecordId?: string;
  compensationDirection: CompensationDirection;
  amount: number;
  status: "pending" | "processed";
  description?: string;
  createdAt: string;
}

export interface InventoryRecord {
  id: string;
  skuCode: string;
  skuName?: string;
  warehouse?: string;
  quantity: number;
  lockedQuantity: number;
  availableQuantity: number;
  batchNo?: string;
  status: "available" | "qc_hold" | "locked";
  updatedAt: string;
}

export interface ScanRecord {
  id: string;
  waybillSnapshotId?: string;
  externalCode?: string;
  skuCode: string;
  skuName?: string;
  batchNo?: string;
  scanTime: string;
  operator: string;
  deviceId?: string;
  qcResult: QCResult;
  failReason?: string;
  triggeredRuleId?: string;
  triggeredRuleName?: string;
  batchStatus: BatchStatus;
  ticketId?: string;
  createdAt: string;
}

export interface QCRule {
  id: string;
  name: string;
  exceptionSubType: ExceptionType;
  conditionField: string;
  conditionOperator: "gt" | "lt" | "gte" | "lte" | "eq" | "neq" | "contains";
  conditionValue: string;
  severity: "low" | "medium" | "high" | "critical";
  autoCreateTicket: boolean;
  approvalLevel: number;
  enabled: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface SystemConfig {
  id: string;
  configKey: string;
  configValue: string;
  description?: string;
  updatedAt: string;
}

export type UserRole = "operator" | "qc_supervisor" | "level1_approver" | "level2_approver" | "admin";

export interface CurrentUser {
  id: string;
  name: string;
  role: UserRole;
  warehouse?: string;
}

export const MOCK_USERS: CurrentUser[] = [
  { id: "user_op_01", name: "张三（操作员）", role: "operator", warehouse: "WH-01" },
  { id: "user_qc_01", name: "李四（品控主管）", role: "qc_supervisor", warehouse: "WH-01" },
  { id: "user_l1_01", name: "王五（一级审批）", role: "level1_approver", warehouse: "WH-01" },
  { id: "user_l2_01", name: "赵六（二级审批）", role: "level2_approver", warehouse: "WH-01" },
  { id: "user_admin", name: "管理员", role: "admin", warehouse: "WH-01" },
];

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ===== 列表查询 =====
export interface TicketListParams {
  status?: TicketStatus;
  exceptionType?: ExceptionType;
  exceptionSource?: ExceptionSource;
  waybillCode?: string;
  reporter?: string;
  page?: number;
  pageSize?: number;
}

export interface TicketListResult {
  tickets: ExceptionTicket[];
  total: number;
  page: number;
  pageSize: number;
}
