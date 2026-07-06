// 品控规则引擎
// 可配置的规则匹配引擎，不硬编码任何触发条件
// 支持 gt/lt/gte/lte/eq/neq/contains 操作符

import { QCRule, ExceptionType } from "@/types";

export interface QCInput {
  skuCode: string;
  skuName?: string;
  expectedQuantity?: number;
  actualQuantity?: number;
  damageLevel?: number;
  specDeviation?: boolean;
  labelMatch?: boolean;
  batchValid?: boolean;
}

export interface QCRuleMatch {
  rule: QCRule;
  matched: boolean;
  detail: string;
}

export interface QCResult {
  passed: boolean;
  exceptionType?: ExceptionType;
  severity?: "low" | "medium" | "high" | "critical";
  approvalLevel?: number;
  matchedRules: QCRuleMatch[];
  summary: string;
}

/**
 * 评估单个条件
 */
function evaluateCondition(
  actualValue: number | string | boolean,
  operator: QCRule["conditionOperator"],
  thresholdValue: string
): { matched: boolean; detail: string } {
  const threshold = parseFloat(thresholdValue);

  switch (operator) {
    case "gt":
      if (typeof actualValue === "number") {
        const m = actualValue > threshold;
        return { matched: m, detail: m ? `${actualValue} > ${threshold}` : `${actualValue} <= ${threshold}` };
      }
      break;
    case "lt":
      if (typeof actualValue === "number") {
        const m = actualValue < threshold;
        return { matched: m, detail: m ? `${actualValue} < ${threshold}` : `${actualValue} >= ${threshold}` };
      }
      break;
    case "gte":
      if (typeof actualValue === "number") {
        const m = actualValue >= threshold;
        return { matched: m, detail: m ? `${actualValue} >= ${threshold}` : `${actualValue} < ${threshold}` };
      }
      break;
    case "lte":
      if (typeof actualValue === "number") {
        const m = actualValue <= threshold;
        return { matched: m, detail: m ? `${actualValue} <= ${threshold}` : `${actualValue} > ${threshold}` };
      }
      break;
    case "eq":
      return { matched: String(actualValue) === thresholdValue, detail: `值为 ${actualValue}，比较值 ${thresholdValue}` };
    case "neq":
      return { matched: String(actualValue) !== thresholdValue, detail: `值为 ${actualValue}，比较值 ${thresholdValue}` };
    case "contains":
      return { matched: String(actualValue).includes(thresholdValue), detail: `值为 ${actualValue}，包含检测 ${thresholdValue}` };
  }
  return { matched: false, detail: "不支持的操作符" };
}

/**
 * 品控规则引擎主入口
 */
export function runQCEngine(input: QCInput, rules: QCRule[]): QCResult {
  const matchedRules: QCRuleMatch[] = [];

  for (const rule of rules) {
    let actualValue: number | string | boolean | undefined;

    // 根据规则的条件字段提取实际值
    switch (rule.conditionField) {
      case "quantity_diff_percent":
        if (input.expectedQuantity && input.actualQuantity !== undefined && input.expectedQuantity > 0) {
          actualValue = Math.abs((input.actualQuantity - input.expectedQuantity) / input.expectedQuantity) * 100;
        }
        break;
      case "damage_level":
        actualValue = input.damageLevel;
        break;
      case "spec_deviation":
        actualValue = input.specDeviation ? 1 : 0;
        break;
      case "label_match":
        actualValue = input.labelMatch;
        break;
      case "batch_valid":
        actualValue = input.batchValid;
        break;
    }

    if (actualValue === undefined) continue;

    const result = evaluateCondition(actualValue, rule.conditionOperator, rule.conditionValue);
    matchedRules.push({ rule, ...result });
  }

  // 找到最高严重度的匹配规则
  const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  let worstMatch: QCRuleMatch | null = null;

  for (const m of matchedRules) {
    if (!m.matched) continue;
    if (!worstMatch || severityOrder[m.rule.severity] > severityOrder[worstMatch.rule.severity]) {
      worstMatch = m;
    }
  }

  if (!worstMatch) {
    return {
      passed: true,
      matchedRules,
      summary: `品控检测通过：${matchedRules.length} 条规则均未触发`,
    };
  }

  return {
    passed: false,
    exceptionType: worstMatch.rule.exceptionSubType,
    severity: worstMatch.rule.severity,
    approvalLevel: worstMatch.rule.approvalLevel,
    matchedRules,
    summary: `触发规则【${worstMatch.rule.name}】：${worstMatch.detail}（严重度：${worstMatch.rule.severity}）`,
  };
}
