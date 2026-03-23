/*******************************************************************************
 * Copyright (C) 2026 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 *******************************************************************************/

import { inject, injectable } from 'inversify';
import type { EmitterWebhookEvent } from '@octokit/webhooks';

import type { PullRequestReviewListener } from '/@/api/pull-request-review-listener';
import { AddLabelHelper } from '/@/helpers/add-label-helper';
import { CheckRunHelper, type CheckRunAnnotation } from '/@/helpers/check-run-helper';
import { DomainsHelper, type DomainEntry } from '/@/helpers/domains-helper';
import { FolderDomainsHelper } from '/@/helpers/folder-domains-helper';
import { PullRequestFilesHelper, type PullRequestFile } from '/@/helpers/pull-request-files-helper';
import { PullRequestsHelper } from '/@/helpers/pull-requests-helper';
import { RemoveLabelHelper } from '/@/helpers/remove-label-helper';
import { IssueInfo } from '/@/info/issue-info';

interface SubgroupStatus {
  subgroup: string;
  approved: boolean;
  approvedBy: string[];
  pendingReviewers: string[];
}

interface DomainStatus {
  domain: string;
  approved: boolean;
  subgroups: SubgroupStatus[];
}

@injectable()
export class DomainReviewCheckRunLogic implements PullRequestReviewListener {
  @inject(AddLabelHelper)
  private addLabelHelper: AddLabelHelper;

  @inject(CheckRunHelper)
  private checkRunHelper: CheckRunHelper;

  @inject(DomainsHelper)
  private domainsHelper: DomainsHelper;

  @inject(FolderDomainsHelper)
  private folderDomainsHelper: FolderDomainsHelper;

  @inject(PullRequestFilesHelper)
  private pullRequestFilesHelper: PullRequestFilesHelper;

  @inject(PullRequestsHelper)
  private pullRequestsHelper: PullRequestsHelper;

  @inject(RemoveLabelHelper)
  private removeLabelHelper: RemoveLabelHelper;

  async execute(event: EmitterWebhookEvent<'pull_request_review'>): Promise<void> {
    const pr = event.payload.pull_request;
    const owner = event.payload.repository.owner.login;
    const repo = event.payload.repository.name;
    const prNumber = pr.number;
    const headSha = pr.head.sha;
    const labels = pr.labels?.map(l => l.name) ?? [];

    const domains = this.domainsHelper.getDomainsByLabels(labels);

    const issueInfo = new IssueInfo().withOwner(owner).withRepo(repo).withNumber(prNumber).withLabels(labels);

    await this.updateCheckRun(owner, repo, prNumber, headSha, domains, issueInfo);
  }

  async updateCheckRun(
    owner: string,
    repo: string,
    prNumber: number,
    headSha: string,
    domains: DomainEntry[],
    issueInfo?: IssueInfo,
    files?: PullRequestFile[],
  ): Promise<void> {
    if (domains.length === 0) {
      console.log(`DomainReviewCheckRun: No domains found for PR #${prNumber}, setting check to failure`);
      await this.checkRunHelper.createOrUpdateCheckRun(
        owner,
        repo,
        headSha,
        'completed',
        'failure',
        'No domain labels found',
        'No domain labels found on this PR. Add `domain/<name>/inreview` labels to enable domain-based review tracking.',
      );
      return;
    }

    const reviews = await this.pullRequestsHelper.listReviews(owner, repo, prNumber);

    // Build latest review state per reviewer (last review wins)
    const latestReviewByUser = new Map<string, string>();
    for (const review of reviews) {
      if (review.user) {
        latestReviewByUser.set(review.user, review.state);
      }
    }

    // Resolve repository owners for inherited-review fallback
    const repoDomains = this.domainsHelper.getDomainsByRepository(owner, repo);
    const repoOwnerNames = repoDomains.flatMap(d => d.owners);
    const repoOwnerUsernames = this.domainsHelper.resolveGitHubUsernames(repoOwnerNames);

    // Group domains by parent domain name
    const parentGroups = new Map<string, DomainEntry[]>();
    for (const domain of domains) {
      const parentName = this.domainsHelper.getParentDomainName(domain);
      const group = parentGroups.get(parentName) ?? [];
      group.push(domain);
      parentGroups.set(parentName, group);
    }

    // Evaluate each parent domain (with subgroups)
    const domainStatuses: DomainStatus[] = [...parentGroups.entries()].map(([parentName, subgroupDomains]) => {
      const subgroups: SubgroupStatus[] = subgroupDomains.map(domain => {
        let ownerUsernames = this.domainsHelper.resolveGitHubUsernames(domain.owners);

        // Dependency domains: merge with repository owners (additive)
        if (this.isDependencyDomain(domain)) {
          const merged = new Set([...ownerUsernames, ...repoOwnerUsernames]);
          ownerUsernames = [...merged];
        } else if (ownerUsernames.length === 0) {
          // Non-dependency domains with no owners inherit from repository owners
          ownerUsernames = repoOwnerUsernames;
        }

        // If still no owners after inheritance, mark as inherited-review
        if (ownerUsernames.length === 0) {
          return {
            subgroup: domain.domain,
            approved: true,
            approvedBy: ['inherited-review'],
            pendingReviewers: [],
          };
        }

        const approvedBy: string[] = [];
        const pendingReviewers: string[] = [];

        for (const username of ownerUsernames) {
          const state = latestReviewByUser.get(username);
          if (state === 'APPROVED') {
            approvedBy.push(username);
          } else {
            pendingReviewers.push(username);
          }
        }

        return {
          subgroup: domain.domain,
          approved: approvedBy.length > 0,
          approvedBy,
          pendingReviewers,
        };
      });

      return {
        domain: parentName,
        approved: subgroups.every(sg => sg.approved),
        subgroups,
      };
    });

    // Swap domain labels between /inreview and /reviewed based on approval status
    if (issueInfo) {
      await this.updateDomainLabels(domainStatuses, issueInfo);
    }

    // Fetch files if not provided (e.g. from review event path)
    const prFiles = files ?? (await this.pullRequestFilesHelper.listFiles(owner, repo, prNumber));

    // Build file-to-domain map for annotations and detail text
    const fileToDomainMap = this.folderDomainsHelper.getFileToDomainMap(owner, repo, prFiles);

    const allApproved = domainStatuses.every(ds => ds.approved);
    const summary = this.buildMarkdownSummary(domainStatuses, fileToDomainMap);
    const text = this.buildDetailText(fileToDomainMap, prFiles);
    const annotations = this.buildAnnotations(fileToDomainMap, domainStatuses);

    if (allApproved) {
      console.log(`DomainReviewCheckRun: All domains approved for PR #${prNumber}`);
      await this.checkRunHelper.createOrUpdateCheckRun(
        owner,
        repo,
        headSha,
        'completed',
        'success',
        'All domains approved',
        summary,
        text,
        annotations,
      );
    } else {
      console.log(`DomainReviewCheckRun: Pending approvals for PR #${prNumber}`);
      await this.checkRunHelper.createOrUpdateCheckRun(
        owner,
        repo,
        headSha,
        'in_progress',
        undefined,
        'Awaiting domain approvals',
        summary,
        text,
        annotations,
      );
    }
  }

  private isDependencyDomain(domain: DomainEntry): boolean {
    return domain.domain.startsWith('dependency-');
  }

  private async updateDomainLabels(domainStatuses: DomainStatus[], issueInfo: IssueInfo): Promise<void> {
    for (const ds of domainStatuses) {
      // Use the parent domain name for labels (already stored as parent in DomainStatus)
      const domainName = ds.domain.toLowerCase();
      const inreviewLabel = `domain/${domainName}/inreview`;
      const reviewedLabel = `domain/${domainName}/reviewed`;

      if (ds.approved) {
        // Swap from /inreview to /reviewed
        await this.removeLabelHelper.removeLabel(inreviewLabel, issueInfo);
        await this.addLabelHelper.addLabel([reviewedLabel], issueInfo);
      } else {
        // Swap from /reviewed back to /inreview
        await this.removeLabelHelper.removeLabel(reviewedLabel, issueInfo);
        await this.addLabelHelper.addLabel([inreviewLabel], issueInfo);
      }
    }
  }

  private buildProgressHeader(domainStatuses: DomainStatus[]): string {
    const total = domainStatuses.length;
    const approved = domainStatuses.filter(ds => ds.approved).length;
    const barWidth = 20;
    const filled = Math.round((approved / total) * barWidth);
    const empty = barWidth - filled;
    const percent = Math.round((approved / total) * 100);
    const bar = `\`[${'='.repeat(filled)}${'-'.repeat(empty)}]\``;

    return [`## Domain Review Status \u2014 ${approved}/${total} approved`, '', `${bar} ${percent}%`].join('\n');
  }

  private buildSubgroupRow(sg: SubgroupStatus): string {
    if (sg.approved) {
      const isInherited = sg.approvedBy.length === 1 && sg.approvedBy[0] === 'inherited-review';
      if (isInherited) {
        return `| ${sg.subgroup} | :white_check_mark: Inherited review | Review delegated to repository owners |`;
      }
      const approvers = sg.approvedBy.map(u => `@${u}`).join(', ');
      return `| ${sg.subgroup} | :white_check_mark: Approved | ${approvers} |`;
    }
    const pending = sg.pendingReviewers.map(u => `@${u}`).join(', ');
    return `| ${sg.subgroup} | :hourglass: Pending | Awaiting: ${pending} |`;
  }

  private buildDomainSection(ds: DomainStatus, matchedFiles?: string[]): string {
    const approvedCount = ds.subgroups.filter(sg => sg.approved).length;
    const totalCount = ds.subgroups.length;
    const icon = ds.approved ? ':white_check_mark:' : ':hourglass:';
    const rows = ds.subgroups.map(sg => this.buildSubgroupRow(sg));
    const matchedLine = this.buildMatchedFilesLine(matchedFiles);

    return [
      `### ${icon} ${ds.domain} (${approvedCount}/${totalCount} approved)`,
      ...(matchedLine ? ['', matchedLine] : []),
      '',
      '| Subgroup | Status | Details |',
      '|----------|--------|---------|',
      ...rows,
    ].join('\n');
  }

  private buildMarkdownSummary(domainStatuses: DomainStatus[], fileToDomainMap: Map<string, string[]>): string {
    const header = this.buildProgressHeader(domainStatuses);

    // Invert file→domains map to domain→files for display
    const domainToFiles = new Map<string, string[]>();
    for (const [filename, domains] of fileToDomainMap) {
      for (const domain of domains) {
        const list = domainToFiles.get(domain) ?? [];
        list.push(filename);
        domainToFiles.set(domain, list);
      }
    }

    const sections = domainStatuses.map(ds => {
      // Collect files matching this domain or any of its subgroups
      const files = new Set<string>();
      for (const sg of ds.subgroups) {
        const sgFiles = domainToFiles.get(sg.subgroup);
        if (sgFiles) {
          for (const f of sgFiles) {
            files.add(f);
          }
        }
      }
      // Also check by parent domain name
      const parentFiles = domainToFiles.get(ds.domain);
      if (parentFiles) {
        for (const f of parentFiles) {
          files.add(f);
        }
      }
      return this.buildDomainSection(ds, files.size > 0 ? [...files] : undefined);
    });

    return [header, '', '---', '', ...sections.flatMap((s, i) => (i < sections.length - 1 ? [s, ''] : [s]))].join('\n');
  }

  private buildMatchedFilesLine(files?: string[]): string {
    if (!files || files.length === 0) {
      return '';
    }
    const maxDisplay = 5;
    const displayed = files
      .slice(0, maxDisplay)
      .map(f => `\`${f}\``)
      .join(', ');
    const remaining = files.length - maxDisplay;
    const suffix = remaining > 0 ? ` +${remaining} more` : '';
    return `> Matched by: ${displayed}${suffix}`;
  }

  private buildDetailText(fileToDomainMap: Map<string, string[]>, files: PullRequestFile[]): string | undefined {
    if (fileToDomainMap.size === 0) {
      return undefined;
    }

    // Group files by domain
    const domainToFiles = new Map<string, { filename: string; status: string }[]>();
    const unmatchedFiles: { filename: string; status: string }[] = [];

    for (const file of files) {
      const domains = fileToDomainMap.get(file.filename);
      if (!domains || domains.length === 0) {
        unmatchedFiles.push(file);
        continue;
      }
      for (const domain of domains) {
        const list = domainToFiles.get(domain) ?? [];
        list.push(file);
        domainToFiles.set(domain, list);
      }
    }

    const lines: string[] = ['## Files by Domain', ''];

    for (const [domain, domainFiles] of [...domainToFiles.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`### ${domain}`);
      for (const f of domainFiles) {
        lines.push(`- \`${f.filename}\` (${f.status})`);
      }
      lines.push('');
    }

    if (unmatchedFiles.length > 0) {
      lines.push('### Unmatched');
      for (const f of unmatchedFiles) {
        lines.push(`- \`${f.filename}\` (${f.status})`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private buildAnnotations(
    fileToDomainMap: Map<string, string[]>,
    domainStatuses: DomainStatus[],
  ): CheckRunAnnotation[] {
    // Build a lookup of domain approval status
    const domainApprovalMap = new Map<string, boolean>();
    for (const ds of domainStatuses) {
      domainApprovalMap.set(ds.domain, ds.approved);
      for (const sg of ds.subgroups) {
        domainApprovalMap.set(sg.subgroup, sg.approved);
      }
    }

    const annotations: CheckRunAnnotation[] = [];
    for (const [filename, domains] of fileToDomainMap) {
      if (domains.length === 0) {
        continue;
      }
      const domainNames = domains.join(', ');
      const allApproved = domains.every(d => domainApprovalMap.get(d) ?? false);
      const statusText = allApproved ? 'Approved' : 'Pending';
      annotations.push({
        path: filename,
        start_line: 1,
        end_line: 1,
        annotation_level: 'notice',
        title: domainNames,
        message: `Domain: ${domainNames} \u2014 ${statusText}`,
      });
    }

    return annotations;
  }
}
