/**
 * The shapes the API returns.
 *
 * Request shapes are NOT here — those come from @ecms/contracts, so the browser
 * and the server validate against one definition rather than two copies that
 * drift. These are the response shapes, which the API derives from the database
 * and this application only reads.
 */
import type { ProjectStatus, ProjectType, Role, UserStatus } from '@ecms/contracts';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Client {
  id: string;
  name: string;
  reference: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  archivedAt: string | null;
}

export interface Contact {
  id: string;
  clientId: string;
  name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  version: number;
  archivedAt: string | null;
}

export interface Property {
  id: string;
  clientId: string;
  name: string;
  reference: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  notes: string | null;
  version: number;
  archivedAt: string | null;
}

export interface Project {
  id: string;
  clientId: string;
  propertyId: string;
  code: string;
  name: string;
  description: string | null;
  type: ProjectType;
  status: ProjectStatus;
  startDate: string | null;
  targetEndDate: string | null;
  actualEndDate: string | null;
  version: number;
  createdAt: string;
}

export interface ProjectMember {
  projectId: string;
  userId: string;
  roleCode: Role;
  grantedAt: string;
  grantedBy: string | null;
}

export interface Workstream {
  id: string;
  projectId: string;
  type: 'PLANNING' | 'SUPERVISION';
  name: string;
  notes: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED';
  version: number;
}

export interface UserRow {
  id: string;
  email: string;
  displayName: string;
  status: UserStatus;
  roles: Role[];
  createdAt: string;
}
