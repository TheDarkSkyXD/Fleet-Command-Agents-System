export type TabId = 'allowlists' | 'boundaries' | 'violations' | 'preview';
export type RuleType = 'tool_allowlist' | 'bash_restriction' | 'file_scope' | 'path_boundary';

export interface AddRuleForm {
  ruleType: RuleType;
  value: string;
}

export interface DeleteConfirmation {
  ruleType: RuleType;
  value: string;
}
