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

import type { PullRequestOpenedListener } from '/@/api/pull-request-opened-listener';
import type { PullRequestEditedListener } from '/@/api/pull-request-edited-listener';
import type { PullRequestSynchronizeListener } from '/@/api/pull-request-synchronize-listener';
import { DetectDomainsHelper } from '/@/helpers/detect-domains-helper';
import { DomainsHelper } from '/@/helpers/domains-helper';
import { PullRequestsHelper } from '/@/helpers/pull-requests-helper';
import { AddLabelHelper } from '/@/helpers/add-label-helper';
import { IssueInfo } from '/@/info/issue-info';
import { DomainReviewCheckRunLogic } from '/@/logic/domain-review-check-run-logic';

@injectable()
export class AssignReviewersOnPullRequestLogic
  implements PullRequestOpenedListener, PullRequestEditedListener, PullRequestSynchronizeListener
{
  @inject(DetectDomainsHelper)
  private detectDomainsHelper: DetectDomainsHelper;

  @inject(DomainsHelper)
  private domainsHelper: DomainsHelper;

  @inject(PullRequestsHelper)
  private pullRequestsHelper: PullRequestsHelper;

  @inject(AddLabelHelper)
  private addLabelHelper: AddLabelHelper;

  @inject(DomainReviewCheckRunLogic)
  private domainReviewCheckRunLogic: DomainReviewCheckRunLogic;

  async execute(
    event:
      | EmitterWebhookEvent<'pull_request.opened'>
      | EmitterWebhookEvent<'pull_request.edited'>
      | EmitterWebhookEvent<'pull_request.synchronize'>,
  ): Promise<void> {
    const pr = event.payload.pull_request;
    const owner = event.payload.repository.owner.login;
    const repo = event.payload.repository.name;
    const prNumber = pr.number;
    const prAuthor = pr.user?.login ?? '';
    const body = pr.body ?? '';

    console.log(`AssignReviewers: Processing PR #${prNumber} in ${owner}/${repo}`);

    const { domains: uniqueDomains, files } = await this.detectDomainsHelper.detectDomains(
      owner,
      repo,
      prNumber,
      prAuthor,
      body,
      pr.base.sha,
      pr.head.sha,
    );

    if (uniqueDomains.length === 0) {
      console.log('AssignReviewers: No matching domains found, skipping reviewer assignment');
      return;
    }

    console.log(`AssignReviewers: Matched domains: ${uniqueDomains.map(d => d.domain).join(', ')}`);

    // Resolve reviewers from matched domains
    const reviewers = this.domainsHelper.getReviewersForDomains(uniqueDomains);

    // Exclude the PR author from reviewers
    const filteredReviewers = reviewers.filter(r => r !== prAuthor);

    if (filteredReviewers.length > 0) {
      console.log(`AssignReviewers: Requesting reviews from: ${filteredReviewers.join(', ')}`);
      try {
        await this.pullRequestsHelper.requestReviewers(owner, repo, prNumber, filteredReviewers);
      } catch (error: unknown) {
        console.error(`AssignReviewers: Error requesting reviewers for PR #${prNumber} in ${owner}/${repo}:`, error);
      }
    } else {
      console.log('AssignReviewers: No reviewers to assign (all were excluded as PR author)');
    }

    // Add domain labels to the PR (skip domains already marked as /reviewed)
    const domainLabels = this.domainsHelper.getDomainLabels(uniqueDomains);
    const prAsIssue = new IssueInfo()
      .withOwner(owner)
      .withRepo(repo)
      .withNumber(prNumber)
      .withLabels(pr.labels?.map(l => l.name) ?? []);

    // Don't add /inreview if the domain already has /reviewed
    const labelsToAdd = domainLabels.filter(label => {
      const reviewedVariant = label.replace(/\/inreview$/, '/reviewed');
      return !prAsIssue.hasLabel(reviewedVariant);
    });

    if (labelsToAdd.length > 0) {
      console.log(`AssignReviewers: Adding labels: ${labelsToAdd.join(', ')}`);
      await this.addLabelHelper.addLabel(labelsToAdd, prAsIssue);
    }

    // Create/update domain review check run (chained after labels are set)
    // Build issueInfo with updated labels so updateDomainLabels can correct /inreview → /reviewed
    const headSha = pr.head.sha;
    const updatedLabels = [...new Set([...(pr.labels?.map(l => l.name) ?? []), ...labelsToAdd])];
    const updatedIssueInfo = new IssueInfo()
      .withOwner(owner)
      .withRepo(repo)
      .withNumber(prNumber)
      .withLabels(updatedLabels);

    await this.domainReviewCheckRunLogic.updateCheckRun(
      owner,
      repo,
      prNumber,
      headSha,
      uniqueDomains,
      updatedIssueInfo,
      files,
      prAuthor,
    );
  }
}
