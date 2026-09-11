/**
 * The seam between this app and whatever LLM is behind it. Nothing outside
 * src/llm/ imports a vendor SDK, so swapping providers is a new file here plus
 * an env var — never a change to the detector or summariser.
 */

export const CONCERN_CATEGORIES = [
  'machine_breakdown',
  'quality_reprint',
  'delivery_delay',
  'customer_complaint',
  'material_shortage',
  'safety',
  'hr_attendance',
  'other',
] as const;

export type ConcernCategory = (typeof CONCERN_CATEGORIES)[number];
export type Severity = 'low' | 'medium' | 'high';

export interface LlmMessage {
  msgId: string;
  senderName: string | null;
  ts: Date;
  text: string;
}

export interface ConcernCandidate {
  messageIds: string[];
  category: ConcernCategory;
  severity: Severity;
  summary: string;
  ownerHint: string | null;
}

export interface ClassifyInput {
  groupName: string;
  /** Messages to judge. */
  newMessages: LlmMessage[];
  /** Already-classified context. Never flagged again — background only. */
  contextMessages: LlmMessage[];
}

export interface ClassifyResult {
  concerns: ConcernCandidate[];
  /** Which model produced the result that was kept. */
  model: string;
  /** True when the fast model's output was rejected and the strong model re-ran. */
  escalated: boolean;
  escalationReason: 'high_severity' | 'malformed_json' | null;
}

export interface Llm {
  classify(input: ClassifyInput): Promise<ClassifyResult>;
}
