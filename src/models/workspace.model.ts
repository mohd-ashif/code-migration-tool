export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  ownerId: string;
  planId: string; // e.g. 'free', 'pro'
  storageUsed: number;
  storageLimit: number;
  migrationCount: number;
  status: 'active' | 'suspended' | string;
  timezone: string;
  country?: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: 'owner' | 'admin' | 'developer' | 'viewer' | string;
  status: 'active' | 'inactive' | string;
  joinedAt: Date;
  invitedBy?: string | null;
  lastActiveAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  email: string;
  role: 'owner' | 'admin' | 'developer' | 'viewer' | string;
  token: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled' | string;
  expiresAt: Date;
  acceptedAt?: Date | null;
  invitedBy: string;
  createdAt: Date;
}

export interface WorkspaceActivityLog {
  id: string;
  workspaceId: string;
  userId?: string | null;
  action: string;
  metadata?: any | null;
  createdAt: Date;
}
