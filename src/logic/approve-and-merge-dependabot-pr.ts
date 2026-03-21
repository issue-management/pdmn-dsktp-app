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

import semver from 'semver';

import type { EmitterWebhookEvent } from '@octokit/webhooks';
import { inject, injectable } from 'inversify';

import type { PullRequestInfo } from '/@/info/pull-request-info';
import { PullRequestReviewsHelper } from '/@/helpers/pr-review-helper';
import type { PushListener } from '/@/api/push-listener';

type Update = {
  component: string;
  from: string;
  to: string;
};

@injectable()
export class ApproveAndMergeDependabotPRLogic implements PushListener {
  @inject(PullRequestReviewsHelper)
  private pullRequestReviewsHelper: PullRequestReviewsHelper;

  async wait(ms: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

  async execute(_event: EmitterWebhookEvent<'push'>): Promise<void> {
    // Get all dependabot PRs that are open, not draft, with dependabot as author and that are green
    const pullRequests =
      await this.pullRequestReviewsHelper.getDependabotPullRequestsRequiringReviewAndPassingAllChecks();

    const validPullRequests: PullRequestInfo[] = [];
    console.log(
      '+ Checking PRs to approve and merge, found',
      pullRequests.length,
      'PRs in the need of a review and passing all checks',
    );
    // Now, use a regexp to get from /to from the title of the PR, and if it matches, approve and merge the PR
    for (const pullRequest of pullRequests) {
      const updates = this.parseDependabotUpdates(pullRequest);

      // If all updates are about a bugfix/patch or minor version updates, approve and merge the PR
      // Use the semver package to check if the update is a patch or minor update
      if (updates.every(update => this.isMinorOrPatchUpdate(update))) {
        // Approve and merge the PR
        console.log(
          ` -> Approving and merging PR ${pullRequest.htmlLink} as it includes only patch or minor updates ${updates
            .map(update => `${update.component} from ${update.from} to ${update.to}`)
            .join(', ')}`,
        );
        validPullRequests.push(pullRequest);
      } else {
        console.log(
          ` -> Not approving PR ${pullRequest.htmlLink} as it includes major updates ${updates
            .map(update => `${update.component} from ${update.from} to ${update.to}`)
            .join(', ')}`,
        );
      }
    }

    // Ok now we have an array of valid pull requests, we can approve and merge them
    // But we should only approve it once per repository to avoid to have merge conflicts if
    // We approve multiple PRs on the same repository too quickly
    // So randomize the order of the PRs and only consolidate an array one at least 1 PR per repository, and approve and merge them with a delay of 1 minute between each approval/merge to give time to github to process the merge and avoid merge conflicts

    const shuffledPullRequests = [...validPullRequests];
    // eslint-disable-next-line sonarjs/pseudo-random
    shuffledPullRequests.sort(() => 0.5 - Math.random());
    const pullRequestsToApproveAndMerge: PullRequestInfo[] = [];
    const repositories = new Set<string>();

    console.log('before PRs are', validPullRequests.length);

    for (const pullRequest of shuffledPullRequests) {
      if (!repositories.has(pullRequest.repo)) {
        pullRequestsToApproveAndMerge.push(pullRequest);
        repositories.add(pullRequest.repo);
      }
    }

    console.log(` -> Approving and merging ${pullRequestsToApproveAndMerge.length} PRs`);

    for (const pullRequest of pullRequestsToApproveAndMerge) {
      await this.approveAndMergePullRequest(pullRequest);
    }
  }

  private async approveAndMergePullRequest(pullRequest: PullRequestInfo): Promise<void> {
    console.log(`   --> Approving PR ${pullRequest.htmlLink} : ${pullRequest.title}`);

    try {
      if (!pullRequest.autoMergeEnabled) {
        console.log(`     --> Setting PR ${pullRequest.htmlLink} in auto-merge mode with rebase method`);
        await this.pullRequestReviewsHelper.setAutoMerge(pullRequest, 'REBASE');
      } else {
        console.log(
          `     --> PR ${pullRequest.htmlLink} is already in auto-merge mode, skipping setting auto-merge again`,
        );
      }

      if (pullRequest.reviewState !== 'APPROVED') {
        await this.pullRequestReviewsHelper.approvePullRequest(pullRequest);
        console.log(`     --> Approved PR ${pullRequest.htmlLink}`);
      } else {
        console.log(`     --> PR ${pullRequest.htmlLink} is already approved, skipping approval`);
      }
    } catch (error: unknown) {
      console.error(`   -->Error while setting auto-merge for PR ${pullRequest.htmlLink}:`, error);
    }
  }

  private isMinorOrPatchUpdate(update: Update): boolean {
    const from = semver.parse(update.from);
    const to = semver.parse(update.to);
    if (!from || !to) {
      return false;
    }
    const diff = semver.diff(from, to);
    return diff === 'patch' || diff === 'minor';
  }

  parseDependabotUpdates(pullRequest: PullRequestInfo): Update[] {
    // If title is matching single pattern (not a group)
    // Like: chore(deps): bump electron from 40.4.1 to 40.8.0
    // Or deps-dev: chore(deps-dev): bump @biomejs/biome from 2.4.4 to 2.4.6

    const singleGroupPattern = /[Bb]ump ([^ ]+) from ([^ ]+) to ([^ ]+)$/;

    // Return single Update from the component
    const match = singleGroupPattern.exec(pullRequest.title);
    if (match) {
      return [
        {
          component: match[1],
          from: match[2],
          to: match[3],
        },
      ];
    }

    // If it's a group of updates
    if (pullRequest.title.includes(' group with ')) {
      const regex = /Updates\s+`([^`]+)`\s+from\s+([^\s]+)\s+to\s+([^\s]+)/g;

      const results: Update[] = [];

      for (const match of pullRequest.body.matchAll(regex)) {
        results.push({
          component: match[1],
          from: match[2],
          to: match[3],
        });
      }

      return results;
    }
    console.log(
      `PR ${pullRequest.htmlLink} has a title that does not match the expected patterns for dependabot updates`,
    );
    return [];
  }
}
