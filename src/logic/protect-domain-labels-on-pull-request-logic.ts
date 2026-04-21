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

import type { PullRequestLabeledListener } from '/@/api/pull-request-labeled-listener';
import { DetectDomainsHelper } from '/@/helpers/detect-domains-helper';
import { DomainsHelper } from '/@/helpers/domains-helper';
import { RemoveLabelHelper } from '/@/helpers/remove-label-helper';
import { DomainReviewCheckRunLogic } from '/@/logic/domain-review-check-run-logic';
import { IssueInfo } from '/@/info/issue-info';

const DOMAIN_LABEL_PATTERN = /^domain\/[^/]+\/(inreview|reviewed)$/;

@injectable()
export class ProtectDomainLabelsOnPullRequestLogic implements PullRequestLabeledListener {
  @inject(RemoveLabelHelper)
  private removeLabelHelper: RemoveLabelHelper;

  @inject(DomainsHelper)
  private domainsHelper: DomainsHelper;

  @inject(DetectDomainsHelper)
  private detectDomainsHelper: DetectDomainsHelper;

  @inject(DomainReviewCheckRunLogic)
  private domainReviewCheckRunLogic: DomainReviewCheckRunLogic;

  async execute(
    event: EmitterWebhookEvent<'pull_request.labeled'> | EmitterWebhookEvent<'pull_request.unlabeled'>,
  ): Promise<void> {
    // Skip changes made by the bot itself to prevent infinite loops
    if (event.payload.sender.type === 'Bot') {
      return;
    }

    const labelName = event.payload.label?.name;
    if (!labelName || !DOMAIN_LABEL_PATTERN.test(labelName)) {
      return;
    }

    const pr = event.payload.pull_request;
    const owner = event.payload.repository.owner.login;
    const repo = event.payload.repository.name;
    const prNumber = pr.number;
    const headSha = pr.head.sha;
    const prAuthor = pr.user?.login ?? '';
    const body = pr.body ?? '';

    console.log(
      `ProtectDomainLabels: Detected manual label change on PR #${prNumber} in ${owner}/${repo} by ${event.payload.sender.login}: ${event.payload.action} "${labelName}"`,
    );

    // Re-derive the correct set of domains from file changes, repo mapping, issues, and dependencies
    const { domains, files } = await this.detectDomainsHelper.detectDomains(
      owner,
      repo,
      prNumber,
      prAuthor,
      body,
      pr.base.sha,
      headSha,
    );

    if (domains.length === 0) {
      return;
    }

    // Compute expected domain label prefixes from the detected domains
    const expectedPrefixes = new Set(
      domains.map(d => `domain/${this.domainsHelper.normalizeDomainName(this.domainsHelper.getParentDomainName(d))}`),
    );

    // Current labels on the PR (payload reflects state AFTER the event)
    const currentLabels = pr.labels?.map(l => l.name) ?? [];
    const currentDomainLabels = currentLabels.filter(l => DOMAIN_LABEL_PATTERN.test(l));

    const issueInfo = new IssueInfo().withOwner(owner).withRepo(repo).withNumber(prNumber).withLabels(currentLabels);

    // Remove bogus domain labels (ones NOT part of the detected domains)
    const labelsToRemove = currentDomainLabels.filter(
      l => !expectedPrefixes.has(this.domainsHelper.normalizeDomainName(l.replace(/\/(inreview|reviewed)$/, ''))),
    );
    for (const label of labelsToRemove) {
      console.log(`ProtectDomainLabels: Removing invalid domain label: ${label}`);
      await this.removeLabelHelper.removeLabel(label, issueInfo);
    }

    // Keep non-domain labels + valid domain labels (preserving their reviewed/inreview suffix)
    // Missing domain labels are intentionally absent so updateDomainLabels adds the correct one
    const correctedLabels = currentLabels.filter(l => {
      if (!DOMAIN_LABEL_PATTERN.test(l)) return true;
      const prefix = this.domainsHelper.normalizeDomainName(l.replace(/\/(inreview|reviewed)$/, ''));
      return expectedPrefixes.has(prefix);
    });
    const correctedIssueInfo = new IssueInfo()
      .withOwner(owner)
      .withRepo(repo)
      .withNumber(prNumber)
      .withLabels(correctedLabels);

    await this.domainReviewCheckRunLogic.updateCheckRun(
      owner,
      repo,
      prNumber,
      headSha,
      domains,
      correctedIssueInfo,
      files,
      prAuthor,
    );
  }
}
