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

import type { IssueCommentCreatedListener } from '/@/api/issue-comment-created-listener';
import { AddLabelHelper } from '/@/helpers/add-label-helper';
import { DomainsHelper } from '/@/helpers/domains-helper';
import { RemoveLabelHelper } from '/@/helpers/remove-label-helper';
import { IssueInfo } from '/@/info/issue-info';

const INREVIEW_LABEL_PATTERN = /^domain\/([^/]+)\/inreview$/;

@injectable()
export class ReviewedCommandOnIssueCommentLogic implements IssueCommentCreatedListener {
  @inject(AddLabelHelper)
  private addLabelHelper: AddLabelHelper;

  @inject(DomainsHelper)
  private domainsHelper: DomainsHelper;

  @inject(RemoveLabelHelper)
  private removeLabelHelper: RemoveLabelHelper;

  async execute(event: EmitterWebhookEvent<'issue_comment.created'>): Promise<void> {
    const comment = event.payload.comment;
    const firstLine = comment.body.trim().split('\n')[0].trim();

    if (!firstLine.startsWith('/reviewed')) {
      return;
    }

    const arg = firstLine.substring('/reviewed'.length).trim();
    const targetDomain = arg ? this.parseDomainArg(arg) : undefined;

    const commenter = comment.user?.login;
    if (!commenter) {
      return;
    }
    const issue = event.payload.issue;
    const owner = event.payload.repository.owner.login;
    const repo = event.payload.repository.name;
    const issueNumber = issue.number;
    const labels = (issue.labels ?? []).map(l => l.name).filter((name): name is string => !!name);

    const inreviewLabels = labels.filter(l => INREVIEW_LABEL_PATTERN.test(l));
    if (inreviewLabels.length === 0) {
      return;
    }

    const ownedDomains = this.domainsHelper.getDomainsByOwnerUsername(commenter);
    const ownedParentNames = new Set(
      ownedDomains.map(d => this.domainsHelper.normalizeDomainName(this.domainsHelper.getParentDomainName(d))),
    );

    if (ownedParentNames.size === 0) {
      return;
    }

    const issueInfo = new IssueInfo().withOwner(owner).withRepo(repo).withNumber(issueNumber).withLabels(labels);

    for (const label of inreviewLabels) {
      const match = INREVIEW_LABEL_PATTERN.exec(label);
      if (!match) {
        continue;
      }

      const domainName = match[1];

      if (targetDomain && this.domainsHelper.normalizeDomainName(targetDomain) !== domainName) {
        continue;
      }

      if (!ownedParentNames.has(domainName)) {
        continue;
      }

      console.log(
        `ReviewedCommand: Swapping label for domain "${domainName}" on issue #${issueNumber} by ${commenter}`,
      );
      await this.removeLabelHelper.removeLabel(label, issueInfo);
      await this.addLabelHelper.addLabel([`domain/${domainName}/reviewed`], issueInfo);
    }
  }

  private parseDomainArg(arg: string): string {
    let domain = arg;
    if (domain.startsWith('domain/')) {
      domain = domain.substring('domain/'.length);
    }
    domain = domain.replace(/\/(inreview|reviewed)$/, '');
    return domain;
  }
}
