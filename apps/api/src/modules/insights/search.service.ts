import type { SearchResult } from '@ecms/contracts';
import { Injectable } from '@nestjs/common';

import { AuthorizationService } from '../access';
import { ClientService, PropertyService } from '../directory';
import { ProjectService } from '../projects';
import { ProposalService } from '../proposals';

const PAGE_SIZE = 5;

/**
 * Fans out to each register's own `list({ search })` (docs/phase-11-plan.md
 * §6) rather than a second search implementation — every one of those
 * services already matches `q` case-insensitively against its own
 * name/reference/code fields, and already scopes its own rows. A resource is
 * skipped entirely, not merely filtered to nothing, when the caller lacks
 * that resource's own `:view` permission anywhere.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly clients: ClientService,
    private readonly properties: PropertyService,
    private readonly projects: ProjectService,
    private readonly proposals: ProposalService,
  ) {}

  async search(userId: string, q: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    if (await this.authorization.canAnywhere(userId, 'client:view')) {
      const page = await this.clients.list({
        search: q,
        page: 1,
        pageSize: PAGE_SIZE,
        includeArchived: false,
      });
      results.push(
        ...page.items.map((c) => ({
          type: 'CLIENT' as const,
          id: c.id,
          label: c.name,
          sublabel: c.reference,
          projectId: null,
        })),
      );
    }

    if (await this.authorization.canAnywhere(userId, 'property:view')) {
      const page = await this.properties.list({
        search: q,
        page: 1,
        pageSize: PAGE_SIZE,
        includeArchived: false,
      });
      results.push(
        ...page.items.map((p) => ({
          type: 'PROPERTY' as const,
          id: p.id,
          label: p.name,
          sublabel: p.plotNumber ?? p.reference,
          projectId: null,
        })),
      );
    }

    if (await this.authorization.canAnywhere(userId, 'project:view')) {
      const page = await this.projects.list({ search: q, page: 1, pageSize: PAGE_SIZE }, userId);
      results.push(
        ...page.items.map((p) => ({
          type: 'PROJECT' as const,
          id: p.id,
          label: `${p.code} — ${p.name}`,
          sublabel: p.status,
          projectId: p.id,
        })),
      );
    }

    if (await this.authorization.canAnywhere(userId, 'proposal:view')) {
      const page = await this.proposals.list({ search: q, page: 1, pageSize: PAGE_SIZE });
      results.push(
        ...page.items.map((p) => ({
          type: 'PROPOSAL' as const,
          id: p.id,
          label: `${p.sketchNumber} — ${p.contactName}`,
          sublabel: p.status,
          projectId: p.convertedProjectId,
        })),
      );
    }

    return results;
  }
}
