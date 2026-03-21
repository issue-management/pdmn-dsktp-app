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
import { CheckRunHelper } from '/@/helpers/check-run-helper';
import { DomainsHelper, type DomainEntry } from '/@/helpers/domains-helper';
import { PullRequestsHelper } from '/@/helpers/pull-requests-helper';

interface DomainStatus {
  domain: string;
  approved: boolean;
  approvedBy: string[];
  pendingReviewers: string[];
}

@injectable()
export class DomainReviewCheckRunLogic implements PullRequestReviewListener {
  @inject(CheckRunHelper)
  private checkRunHelper: CheckRunHelper;

  @inject(DomainsHelper)
  private domainsHelper: DomainsHelper;

  @inject(PullRequestsHelper)
  private pullRequestsHelper: PullRequestsHelper;

  async execute(event: EmitterWebhookEvent<'pull_request_review'>): Promise<void> {
    const pr = event.payload.pull_request;
    const owner = event.payload.repository.owner.login;
    const repo = event.payload.repository.name;
    const prNumber = pr.number;
    const headSha = pr.head.sha;
    const labels = pr.labels?.map(l => l.name) ?? [];

    const domains = this.domainsHelper.getDomainsByLabels(labels);

    await this.updateCheckRun(owner, repo, prNumber, headSha, domains);
  }

  async updateCheckRun(
    owner: string,
    repo: string,
    prNumber: number,
    headSha: string,
    domains: DomainEntry[],
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

    // Evaluate each domain
    const domainStatuses: DomainStatus[] = domains.map(domain => {
      const ownerUsernames = this.domainsHelper.resolveGitHubUsernames(domain.owners);
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
        domain: domain.domain,
        approved: approvedBy.length > 0,
        approvedBy,
        pendingReviewers,
      };
    });

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

  private buildMarkdownSummary(domainStatuses: DomainStatus[]): string {
    const rows = domainStatuses.map(ds => {
      if (ds.approved) {
        const approvers = ds.approvedBy.map(u => `@${u}`).join(', ');
        return `| ${ds.domain} | :white_check_mark: Approved | ${approvers} |`;
      }
      const pending = ds.pendingReviewers.map(u => `@${u}`).join(', ');
      return `| ${ds.domain} | :hourglass: Pending | Awaiting: ${pending} |`;
    });

    return [
      '## Domain Review Status',
      '',
      '| Domain | Status | Details |',
      '|--------|--------|---------|',
      ...rows,
    ].join('\n');
  }
}
