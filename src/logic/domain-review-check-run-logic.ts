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
import { CheckRunHelper } from '/@/helpers/check-run-helper';
import { DomainsHelper, type DomainEntry } from '/@/helpers/domains-helper';
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

    // Minor/patch dependency-only PRs are owned by the bot and need no human review
    if (domains.length === 1 && domains[0].domain === 'dependency-update-minor') {
      console.log(`DomainReviewCheckRun: Minor dependency update PR #${prNumber}, no human review required`);
      await this.checkRunHelper.createOrUpdateCheckRun(
        owner,
        repo,
        headSha,
        'completed',
        'success',
        'Minor/patch dependency updates only',
        this.buildMinorDepSummary(),
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

        // Domains with no owners inherit reviewers from the repository domain
        if (ownerUsernames.length === 0) {
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

    const allApproved = domainStatuses.every(ds => ds.approved);
    const summary = this.buildMarkdownSummary(domainStatuses);

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
      );
    }
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

  private buildMinorDepSummary(): string {
    return [
      '## Domain Review Status',
      '',
      'This PR contains only minor/patch dependency version bumps.',
      'No human review is required.',
      '',
      '| Domain | Status | Details |',
      '|--------|--------|---------|',
      '| dependency-update-minor | :white_check_mark: Approved | Minor/patch updates only |',
    ].join('\n');
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

  private buildMarkdownSummary(domainStatuses: DomainStatus[]): string {
    const rows = domainStatuses.flatMap(ds => ds.subgroups.map(sg => this.buildSubgroupRow(sg)));

    return [
      '## Domain Review Status',
      '',
      '| Domain | Status | Details |',
      '|--------|--------|---------|',
      ...rows,
    ].join('\n');
  }
}
