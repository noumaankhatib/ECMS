/**
 * The shapes the API returns.
 *
 * Request shapes are NOT here — those come from @ecms/contracts, so the browser
 * and the server validate against one definition rather than two copies that
 * drift. These are the response shapes, which the API derives from the database
 * and this application only reads.
 */
import type {
  ApprovalStatus,
  DocumentLinkedType,
  DocumentUploadStatus,
  IssuePriority,
  IssueSeverity,
  IssueStatus,
  ProjectStatus,
  ProjectType,
  Role,
  SubmissionStatus,
  UserStatus,
} from '@ecms/contracts';

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

// ---------------------------------------------------------------------------
// Phase 2 — planning, supervision, issues
// ---------------------------------------------------------------------------

export interface PlanningActivity {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  done: boolean;
  version: number;
  archivedAt: string | null;
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  targetDate: string | null;
  achievedDate: string | null;
  version: number;
  archivedAt: string | null;
}

export interface Submission {
  id: string;
  projectId: string;
  reference: string;
  authorityName: string;
  notes: string | null;
  status: SubmissionStatus;
  version: number;
  createdAt: string;
}

export interface SiteVisit {
  id: string;
  projectId: string;
  visitDate: string;
  attendees: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
}

export interface Observation {
  id: string;
  siteVisitId: string;
  description: string;
  category: string | null;
  version: number;
  createdAt: string;
}

export interface Instruction {
  id: string;
  siteVisitId: string;
  directiveText: string;
  assigneeId: string | null;
  dueDate: string | null;
  actionedAt: string | null;
  version: number;
  createdAt: string;
}

export interface Issue {
  id: string;
  projectId: string;
  observationId: string | null;
  title: string;
  description: string | null;
  severity: IssueSeverity;
  priority: IssuePriority;
  ownerId: string | null;
  dueDate: string | null;
  status: IssueStatus;
  closureNotes: string | null;
  version: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Phase 3 — drawings, documents
// ---------------------------------------------------------------------------

export interface Drawing {
  id: string;
  projectId: string;
  number: string;
  title: string;
  currentRevisionId: string | null;
  version: number;
  createdAt: string;
}

export interface DrawingRevision {
  id: string;
  drawingId: string;
  revisionCode: string;
  status: ApprovalStatus;
  fileId: string | null;
  notes: string | null;
  supersededAt: string | null;
  version: number;
  createdAt: string;
}

export interface Document {
  id: string;
  projectId: string;
  category: string;
  title: string;
  description: string | null;
  uploadStatus: DocumentUploadStatus;
  fileId: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  linkedType: DocumentLinkedType | null;
  linkedId: string | null;
  version: number;
  createdAt: string;
  archivedAt: string | null;
}
