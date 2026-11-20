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

import type { PullRequestSynchronizeListener } from '/@/api/pull-request-synchronize-listener';
import { PullRequestsHelper } from '/@/helpers/pull-requests-helper';

// COMMENTED/PENDING reviews do not change a reviewer's decision on GitHub
const DECISIVE_REVIEW_STATES = new Set(['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED']);

/**
 * When new commits are pushed to a PR, re-request a review from reviewers whose
 * latest decision is "changes requested". Reviewers who approved are left alone.
 */
@injectable()
export class RerequestChangesRequestedReviewersLogic implements PullRequestSynchronizeListener {
  @inject(PullRequestsHelper)
  private pullRequestsHelper: PullRequestsHelper;

  async execute(event: EmitterWebhookEvent<'pull_request.synchronize'>): Promise<void> {
    const pr = event.payload.pull_request;
    const owner = event.payload.repository.owner.login;
    const repo = event.payload.repository.name;
    const prAuthor = pr.user?.login ?? '';

    const reviews = await this.pullRequestsHelper.listReviews(owner, repo, pr.number);
    const latestDecisionByUser = new Map<string, string>();
    for (const review of reviews) {
      if (review.user && DECISIVE_REVIEW_STATES.has(review.state)) {
        latestDecisionByUser.set(review.user, review.state);
      }
    }

    const reviewers = [...latestDecisionByUser]
      .filter(([user, state]) => state === 'CHANGES_REQUESTED' && user !== prAuthor)
      .map(([user]) => user);

    if (reviewers.length === 0) {
      return;
    }

    console.log(
      `RerequestReviewers: Re-requesting reviews on PR #${pr.number} in ${owner}/${repo} from: ${reviewers.join(', ')}`,
    );
    try {
      await this.pullRequestsHelper.requestReviewers(owner, repo, pr.number, reviewers);
    } catch (error: unknown) {
      console.error(
        `RerequestReviewers: Error re-requesting reviewers for PR #${pr.number} in ${owner}/${repo}:`,
        error,
      );
    }
  }
}
