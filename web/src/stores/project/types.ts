export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  membersCount: number;
  updatedText: string;
  status: 'active' | 'draft';
}

export interface Teammate {
  id: string;
  sessionId: string;
  name: string;
  initials: string;
  role: 'APPROVER' | 'VIEWER';
  isCreator?: boolean;
  email?: string;
}

export interface PhaseAssignedMember {
  sessionId: string;
  name: string;
  initials: string;
  role: 'APPROVER' | 'VIEWER';
}

export interface ProjectMessage {
  id: string;
  projectId: string;
  sessionId: string;
  content: string;
  createdAt: string;
  isOptimistic?: boolean;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  sessionId: string;
  filename: string;
  mimeType: string;
  storagePath: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ApiEnvelope<T> {
  data: T;
}

export interface ApiProjectMembership {
  role: 'creator' | 'approver' | 'member';
  can_approve: boolean;
  can_edit: boolean;
}

export interface ApiProject {
  id: string;
  name: string;
  description: string;
  created_at: string;
  member_count: number;
  membership: ApiProjectMembership;
}

export interface ApiProjectMember {
  id: string;
  session_id: string;
  role: 'creator' | 'approver' | 'member';
  can_approve: boolean;
  can_edit: boolean;
}

export interface ApiProjectMessage {
  id: string;
  project_id: string;
  session_id: string;
  content: string;
  created_at: string;
}

export interface ApiProjectFile {
  id: string;
  project_id: string;
  session_id: string;
  filename: string;
  mime_type: string;
  storage_path: string;
  size_bytes: number;
  created_at: string;
}

export interface ApiMemberInvitation {
  id: string;
  project_id: string;
  token: string;
  invitee_name: string;
  invitee_email: string;
  role: 'approver' | 'member';
  can_approve: boolean;
  can_edit: boolean;
  created_by_session_id: string;
  created_at: string;
  redeemed_at: string | null;
  redeemed_by_session_id: string | null;
}

export interface FileAttachment {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'other';
  sizeBytes: number;
  url: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface GapItem {
  id: string;
  description: string;
  severity: 'critical' | 'major' | 'minor';
  relatedTaskId?: string;
  sourceMessageIds: string[];
  sourceExcerpt?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  acceptanceCriteria?: string[];
  owner?: string;
  ownerUserId?: string;
  due?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  originalPriority?: 'critical' | 'high' | 'medium' | 'low';
  status: 'proposed' | 'accepted' | 'rejected' | 'gap';
  attachments: FileAttachment[];
  sourceMessageIds: string[];
  sourceExcerpt?: string;
  confidence: 'high' | 'medium' | 'low';
  isNew?: boolean;
  isModified?: boolean;
  isRemoved?: boolean;
}

export interface Phase {
  id: string;
  title: string;
  goal: string;
  description?: string;
  timeframe: string;
  assignedMembers: PhaseAssignedMember[];
  tasks: Task[];
  gaps: GapItem[];
}

export interface Stakeholder {
  userId: string;
  name: string;
  role: string;
  initials: string;
}

export interface RiskItem {
  id: string;
  description: string;
  severity: 'critical' | 'major' | 'minor';
  mitigation?: string;
  sourceMessageIds?: string[];
  sourceExcerpt?: string;
}

export interface TechnologyStackItem {
  title: string;
  value: string;
}

export interface StructuredPlan {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: 'draft' | 'pending_review' | 'finalized' | 'reverted';
  version: number;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
  objectives: string[];
  stakeholders: Stakeholder[];
  technologyStack: TechnologyStackItem[];
  phases: Phase[];
  globalRisks: RiskItem[];
}

export interface ProposedChange {
  id: string;
  action: 'add' | 'update' | 'remove';
  section:
    | 'title'
    | 'description'
    | 'objectives'
    | 'stakeholders'
    | 'technology_stack'
    | 'tasks'
    | 'phases'
    | 'gaps'
    | 'risks'
    | 'global_risks';
  targetId: string;
  title: string;
  detail: string;
  confidence?: 'high' | 'medium' | 'low';
  sourceQuote: string;
  state?: 'pending' | 'applied' | 'rejected' | 'stale';
  justification?: string;
  sourceMessageIds?: string[];
  content?: unknown;
}

export interface ApiPlanAttachment {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  uploaded_by_session_id: string;
  uploaded_at: string;
}

export interface ApiPlanTask {
  id: string;
  title: string;
  description?: string | null;
  acceptance_criteria?: string[];
  owner?: string | null;
  due?: string | null;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  status?: string | null;
  attachments?: ApiPlanAttachment[];
  source_message_ids?: string[];
  source_excerpt?: string | null;
  confidence?: 'high' | 'medium' | 'low' | null;
}

export interface ApiPlanGap {
  id: string;
  description: string;
  severity?: 'critical' | 'major' | 'minor';
  source_message_ids?: string[];
  source_excerpt?: string | null;
}

export interface ApiPlanPhase {
  id: string;
  title: string;
  goal?: string | null;
  description?: string | null;
  timeframe?: string | null;
  assigned_members?: {
    session_id: string;
    name: string;
    initials: string;
    role: 'APPROVER' | 'VIEWER';
  }[];
  tasks?: ApiPlanTask[];
  gaps?: ApiPlanGap[];
}

export interface ApiPlanRisk {
  id: string;
  description: string;
  severity?: 'critical' | 'major' | 'minor';
  mitigation?: string | null;
  source_message_ids?: string[];
  source_excerpt?: string | null;
}

export interface ApiPlanStakeholder {
  user_id: string;
  name: string;
  role: string;
  initials: string;
}

export interface ApiProjectPlan {
  id: string;
  project_id: string;
  version: number;
  finalized_at?: string | null;
  created_at?: string;
  title?: string;
  description?: string;
  objectives?: string[];
  stakeholders?: ApiPlanStakeholder[];
  technology_stack?: { title?: string; value?: string }[];
  phases?: ApiPlanPhase[];
  global_risks?: ApiPlanRisk[];
}

export interface ApiPlanVersion {
  id: string;
  version: number;
  created_at: string;
  status: 'current' | 'archived';
}

export interface PlanVersion {
  id: string;
  version: number;
  createdAt: string;
  status: 'current' | 'archived';
}
