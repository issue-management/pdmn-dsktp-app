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

import type { EmitterWebhookEvent } from '@octokit/webhooks';
import Mustache from 'mustache';
import { inject, injectable } from 'inversify';

import type { PullRequestClosedListener } from '/@/api/pull-request-closed-listener';
import { CommentHelper } from '/@/helpers/comment-helper';
import { MaintainerHelper } from '/@/helpers/maintainer-helper';
import { MergedPrCounterHelper } from '/@/helpers/merged-pr-counter-helper';
import { MilestoneBadgeHelper } from '/@/helpers/milestone-badge-helper';
import { RepositoriesHelper } from '/@/helpers/repositories-helper';
import badgePartial from '/@/templates/thank-contributor/badge.mustache?raw';
import firstContributionTemplate from '/@/templates/thank-contributor/first-contribution.mustache?raw';
import milestone10Template from '/@/templates/thank-contributor/milestone-10.mustache?raw';
import milestone25Template from '/@/templates/thank-contributor/milestone-25.mustache?raw';
import milestone50Template from '/@/templates/thank-contributor/milestone-50.mustache?raw';

const MILESTONE_TEMPLATES: Record<number, string> = {
  1: firstContributionTemplate,
  10: milestone10Template,
  25: milestone25Template,
  50: milestone50Template,
};

@injectable()
export class ThankContributorOnMergedPrLogic implements PullRequestClosedListener {
  @inject(RepositoriesHelper)
  private repositoriesHelper: RepositoriesHelper;

  @inject(MaintainerHelper)
  private maintainerHelper: MaintainerHelper;

  @inject(MergedPrCounterHelper)
  private mergedPrCounterHelper: MergedPrCounterHelper;

  @inject(MilestoneBadgeHelper)
  private milestoneBadgeHelper: MilestoneBadgeHelper;

  @inject(CommentHelper)
  private commentHelper: CommentHelper;

  private readonly milestones = [1, 10, 25, 50];

  async execute(event: EmitterWebhookEvent<'pull_request.closed'>): Promise<void> {
    const pr = event.payload.pull_request;
    const owner = event.payload.repository.owner.login;
    const repo = event.payload.repository.name;

    if (!pr.merged) {
      return;
    }

    if (!this.repositoriesHelper.isKnownRepository(owner, repo)) {
      return;
    }

    if (pr.user.type === 'Bot') {
      return;
    }

    const author = pr.user.login;

    if (await this.maintainerHelper.isMaintainerOrOrgMember(author, owner)) {
      return;
    }

    const count = await this.mergedPrCounterHelper.countMergedPrsByAuthor(author, owner, repo);

    if (!this.milestones.includes(count)) {
      return;
    }

    const template = MILESTONE_TEMPLATES[count];
    const badgeUrl = await this.milestoneBadgeHelper.getRandomBadgeUrl(count);
    const body = Mustache.render(template, { author, count, repo, badgeUrl: badgeUrl ?? '' }, { badge: badgePartial });

    await this.commentHelper.createComment(owner, repo, pr.number, body);
  }
}
