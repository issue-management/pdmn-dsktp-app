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
import { FolderDomainsHelper, type FileMatchDetail } from '/@/helpers/folder-domains-helper';
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

interface DomainFileMatch {
  filename: string;
  pattern: string;
  matchType: 'primary' | 'global' | 'default';
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

    // Build file-to-domain maps for annotations and detail text
    const fileToDomainMap = this.folderDomainsHelper.getFileToDomainMap(owner, repo, prFiles);
    const fileMatchDetails = this.folderDomainsHelper.getFileMatchDetails(owner, repo, prFiles);

    const allApproved = domainStatuses.every(ds => ds.approved);
    const summary = this.buildMarkdownSummary(domainStatuses, fileMatchDetails);
    const text = this.buildDetailText(fileMatchDetails, prFiles);
    const annotations = this.buildAnnotations(fileToDomainMap, domainStatuses);

    if (allApproved) {
      console.log(
        `DomainReviewCheckRun: All domains approved for PR ${owner}/${repo} #${prNumber} , setting check to success`,
      );
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
      console.log(`DomainReviewCheckRun: Pending approvals for PR ${owner}/${repo} #${prNumber}`);
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

  private buildDomainSection(ds: DomainStatus, matchedFiles?: DomainFileMatch[]): string {
    const approvedCount = ds.subgroups.filter(sg => sg.approved).length;
    const totalCount = ds.subgroups.length;
    const icon = ds.approved ? ':white_check_mark:' : ':hourglass:';
    const rows = ds.subgroups.map(sg => this.buildSubgroupRow(sg));
    const isGlobal =
      matchedFiles !== undefined && matchedFiles.length > 0 && matchedFiles.every(f => f.matchType === 'global');
    const globalSuffix = isGlobal ? ' \u2014 \uD83C\uDF10 Global' : '';
    const filesSection = this.buildMatchedFilesSection(matchedFiles);

    return [
      `### ${icon} ${ds.domain} (${approvedCount}/${totalCount} approved)${globalSuffix}`,
      ...(filesSection.length > 0 ? ['', ...filesSection] : []),
      '',
      '| Subgroup | Status | Details |',
      '|----------|--------|---------|',
      ...rows,
    ].join('\n');
  }

  private buildMarkdownSummary(
    domainStatuses: DomainStatus[],
    fileMatchDetails: Map<string, FileMatchDetail[]>,
  ): string {
    const header = this.buildProgressHeader(domainStatuses);

    // Invert file→details map to domain→files with match info
    const domainToFiles = new Map<string, DomainFileMatch[]>();
    for (const [filename, details] of fileMatchDetails) {
      for (const detail of details) {
        const list = domainToFiles.get(detail.domain) ?? [];
        list.push({ filename, pattern: detail.pattern, matchType: detail.matchType });
        domainToFiles.set(detail.domain, list);
      }
    }

    const sections = domainStatuses.map(ds => {
      const files = this.collectDomainFiles(ds, domainToFiles);
      return this.buildDomainSection(ds, files.length > 0 ? files : undefined);
    });

    return [header, '', '---', '', ...sections.flatMap((s, i) => (i < sections.length - 1 ? [s, ''] : [s]))].join('\n');
  }

  private collectDomainFiles(ds: DomainStatus, domainToFiles: Map<string, DomainFileMatch[]>): DomainFileMatch[] {
    const files: DomainFileMatch[] = [];
    const seen = new Set<string>();

    const addFiles = (domainFiles: DomainFileMatch[] | undefined): void => {
      if (!domainFiles) {
        return;
      }
      for (const f of domainFiles) {
        if (!seen.has(f.filename)) {
          seen.add(f.filename);
          files.push(f);
        }
      }
    };

    for (const sg of ds.subgroups) {
      addFiles(domainToFiles.get(sg.subgroup));
    }
    addFiles(domainToFiles.get(ds.domain));

    return files;
  }

  private getMatchTypeLabel(matchType: 'primary' | 'global' | 'default'): string {
    if (matchType === 'global') {
      return 'global';
    }
    if (matchType === 'default') {
      return 'default';
    }
    return 'primary';
  }

  private buildMatchedFilesSection(files?: DomainFileMatch[]): string[] {
    if (!files || files.length === 0) {
      return [];
    }

    const fileLines = files.map(f => {
      const typeLabel = this.getMatchTypeLabel(f.matchType);
      return `- \`${f.filename}\` \u2014 pattern: \`${f.pattern}\` (${typeLabel})`;
    });

    const maxInline = 5;
    if (files.length <= maxInline) {
      return fileLines;
    }

    return [`<details>`, `<summary>${files.length} matched files</summary>`, '', ...fileLines, '', `</details>`];
  }

  private buildDetailText(
    fileMatchDetails: Map<string, FileMatchDetail[]>,
    files: PullRequestFile[],
  ): string | undefined {
    if (fileMatchDetails.size === 0) {
      return undefined;
    }

    const { domainToFiles, unmatchedFiles } = this.groupFilesByDomain(fileMatchDetails, files);
    const lines: string[] = ['## Files by Domain', ''];

    for (const [domain, domainFiles] of [...domainToFiles.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      this.appendDomainDetailSection(lines, domain, domainFiles);
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

  private groupFilesByDomain(
    fileMatchDetails: Map<string, FileMatchDetail[]>,
    files: PullRequestFile[],
  ): {
    domainToFiles: Map<string, { filename: string; status: string; pattern: string; matchType: string }[]>;
    unmatchedFiles: { filename: string; status: string }[];
  } {
    const domainToFiles = new Map<string, { filename: string; status: string; pattern: string; matchType: string }[]>();
    const unmatchedFiles: { filename: string; status: string }[] = [];

    for (const file of files) {
      const details = fileMatchDetails.get(file.filename);
      if (!details || details.length === 0) {
        unmatchedFiles.push(file);
        continue;
      }
      for (const detail of details) {
        const list = domainToFiles.get(detail.domain) ?? [];
        list.push({
          filename: file.filename,
          status: file.status,
          pattern: detail.pattern,
          matchType: detail.matchType,
        });
        domainToFiles.set(detail.domain, list);
      }
    }

    return { domainToFiles, unmatchedFiles };
  }

  private appendDomainDetailSection(
    lines: string[],
    domain: string,
    domainFiles: { filename: string; status: string; pattern: string; matchType: string }[],
  ): void {
    const isGlobal = domainFiles.every(f => f.matchType === 'global');
    const globalSuffix = isGlobal ? ' \u2014 \uD83C\uDF10 Global' : '';
    lines.push(`### ${domain}${globalSuffix}`);

    const fileEntries = domainFiles.map(f => `- \`${f.filename}\` (${f.status}) \u2014 pattern: \`${f.pattern}\``);

    if (domainFiles.length <= 5) {
      lines.push(...fileEntries);
    } else {
      lines.push('<details>');
      lines.push(`<summary>${domainFiles.length} files</summary>`);
      lines.push('');
      lines.push(...fileEntries);
      lines.push('');
      lines.push('</details>');
    }
    lines.push('');
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
