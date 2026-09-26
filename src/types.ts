export type Project = { id: string; name: string; cwd: string };
export type TaskStatus = 'queued' | 'running' | 'waiting_user' | 'completed' | 'failed' | 'interrupted' | 'unknown';
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
export type PermissionLevel = 'safe' | 'workspace' | 'full';
export type CodexPreferences = { model?: string; effort?: ReasoningEffort; permissionLevel?: PermissionLevel };

export type BridgeEvent = {
  type: 'text' | 'status' | 'approval' | 'error';
  text: string;
  taskId?: number;
  approvalId?: string;
  threadId?: string;
};

export type ApprovalDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel';
