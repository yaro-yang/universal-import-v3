// V3 系统配置 - 可配置的阈值和参数
// 所有配置项均可通过数据库动态调整，此处为默认值
// 对应《需求理解与假设说明》文档中的 9 项留白规则

export const DEFAULT_CONFIG = {
  // ① 分级审批金额阈值（元）
  approval: {
    level2Threshold: 5000,
    currency: "CNY",
  },

  // ② 审批超时时长（小时）
  timeout: {
    pendingTimeoutHours: 24,      // 待审批超时 24h：直接升级二级审批
    level1ReviewHours: 48,        // 一级审批超时 48h
    level2ReviewHours: 72,        // 二级审批超时 72h：自动驳回
  },

  // ③ 重新提交次数上限
  resubmit: {
    maxRejectCount: 3,
    exceedAction: "auto_close" as const,
  },

  // ④ 物流异常类型 → 下游执行动作映射
  exceptionActionMapping: {
    lost:        { actions: ["claim", "resend"], hasCompensation: true,  compensationDirection: "to_customer" as const, inventoryImpact: "decrease", description: "丢件：理赔 + 重新发货" },
    damaged:     { actions: ["claim", "return_warehouse"], hasCompensation: true,  compensationDirection: "to_customer" as const, inventoryImpact: "increase", description: "破损：理赔 + 退货入库" },
    rejected:    { actions: ["return_warehouse"], hasCompensation: false, compensationDirection: null, inventoryImpact: "increase", description: "客户拒收：退货入库" },
    timeout:     { actions: ["resend"], hasCompensation: false, compensationDirection: null, inventoryImpact: "decrease", description: "超时未签收：重新发货" },
    address_error: { actions: ["resend"], hasCompensation: false, compensationDirection: null, inventoryImpact: "decrease", description: "地址错误：重新发货" },
    qc_quantity:  { actions: ["return_supplier", "repurchase"], hasCompensation: true, compensationDirection: "from_supplier" as const, inventoryImpact: "decrease", description: "数量不符：退回供应商 + 重新采购" },
    qc_appearance:{ actions: ["return_supplier", "repurchase"], hasCompensation: true, compensationDirection: "from_supplier" as const, inventoryImpact: "decrease", description: "外观破损：退回供应商 + 重新采购" },
    qc_spec:      { actions: ["return_supplier", "repurchase"], hasCompensation: true, compensationDirection: "from_supplier" as const, inventoryImpact: "decrease", description: "规格不符：退回供应商 + 重新采购" },
    qc_label:     { actions: ["return_supplier"], hasCompensation: true, compensationDirection: "from_supplier" as const, inventoryImpact: "decrease", description: "标签错误：退回供应商" },
    qc_batch:     { actions: ["return_supplier", "repurchase"], hasCompensation: true, compensationDirection: "from_supplier" as const, inventoryImpact: "decrease", description: "批次异常：退回供应商 + 重新采购" },
  },

  // ⑤ 角色权限划分
  roles: {
    operator:          { label: "操作员", permissions: ["scan", "report_exception", "view_tickets"], can_approve: false, can_fast_release: false, description: "扫描录入、异常上报" },
    qc_supervisor:     { label: "品控主管", permissions: ["scan", "report_exception", "view_tickets", "fast_release", "manage_qc_rules"], can_approve: false, can_fast_release: true, description: "品控管理、误判快速放行" },
    level1_approver:   { label: "一级审批人", permissions: ["view_tickets", "approve_level1"], can_approve: true, approvalLevel: 1, can_fast_release: false, description: "一级审批（金额 ≤ 阈值）" },
    level2_approver:   { label: "二级审批人", permissions: ["view_tickets", "approve_level2"], can_approve: true, approvalLevel: 2, can_fast_release: false, description: "二级审批（超阈值或升级工单）" },
    admin:             { label: "管理员", permissions: ["*"], can_approve: true, approvalLevel: 2, can_fast_release: true, description: "全部权限" },
  },

  // ⑦ 品控暂扣超时时长（小时）- 独立于审批超时
  qcHold: {
    timeoutHours: 2,
    reason: "货物压仓产生运营成本，需远短于审批超时(48h)。2h足够品控主管复核，超时自动升级避免无限期占仓。",
  },

  // ⑧ 品控规则触发阈值（可配置）
  qcDefaultRules: [
    { name: "数量差异检测", exceptionSubType: "qc_quantity" as const, conditionField: "quantity_diff_percent", conditionOperator: "gt" as const, conditionValue: "5", severity: "high" as const, autoCreateTicket: true, approvalLevel: 1 },
    { name: "严重数量差异", exceptionSubType: "qc_quantity" as const, conditionField: "quantity_diff_percent", conditionOperator: "gt" as const, conditionValue: "20", severity: "critical" as const, autoCreateTicket: true, approvalLevel: 2 },
    { name: "外观破损-轻微", exceptionSubType: "qc_appearance" as const, conditionField: "damage_level", conditionOperator: "gte" as const, conditionValue: "1", severity: "low" as const, autoCreateTicket: true, approvalLevel: 1 },
    { name: "外观破损-严重", exceptionSubType: "qc_appearance" as const, conditionField: "damage_level", conditionOperator: "gte" as const, conditionValue: "3", severity: "critical" as const, autoCreateTicket: true, approvalLevel: 2 },
    { name: "规格偏差检测", exceptionSubType: "qc_spec" as const, conditionField: "spec_deviation", conditionOperator: "gt" as const, conditionValue: "0", severity: "medium" as const, autoCreateTicket: true, approvalLevel: 1 },
    { name: "标签错误检测", exceptionSubType: "qc_label" as const, conditionField: "label_match", conditionOperator: "eq" as const, conditionValue: "false", severity: "medium" as const, autoCreateTicket: true, approvalLevel: 1 },
    { name: "批次异常检测", exceptionSubType: "qc_batch" as const, conditionField: "batch_valid", conditionOperator: "eq" as const, conditionValue: "false", severity: "high" as const, autoCreateTicket: true, approvalLevel: 2 },
  ],

  // ⑨ 品控主管角色权限边界
  qcSupervisorPolicy: {
    canFastRelease: true,
    fastReleaseRequiresReason: true,
    fastReleaseAuditLog: true,
    canManageQCRules: true,
    cannotApprove: true,
    cannotOverrideApproval: true,
    roleOverlapPolicy: "一个人可兼任品控主管和审批人，但对自己操作的扫描不能做快速放行，不能审批自己上报的工单",
  },

  // V2 接口相关
  v2Api: {
    baseUrl: process.env.NEXT_PUBLIC_V2_API_URL || "https://universal-import-v2.vercel.app/api/v2/external",
    apiKey: process.env.V2_API_KEY || "v3-system-api-key-2024",
    timeout: 10000,
    retryCount: 2,
    retryDelay: 1000,
  },

  // ⑥ V2数据同步策略
  sync: {
    strategy: "on_demand_with_cache" as const,
    cacheTTLHours: 1,
    degradeMode: "stale_cache" as const,
    consistencyCheck: "real_time_verify" as const,
    description: "异常上报时实时拉取最新运单信息并刷新本地快照；列表展示用本地快照(1h有效期)；V2不可用时展示缓存数据并标注来源。",
  },
} as const;
