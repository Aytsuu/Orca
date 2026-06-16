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
  role: 'APPROVER' | 'EDITOR' | 'VIEWER';
  isCreator?: boolean;
  email?: string;
}

export interface ProjectMessage {
  id: string;
  projectId: string;
  sessionId: string;
  content: string;
  createdAt: string;
  isOptimistic?: boolean;
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
