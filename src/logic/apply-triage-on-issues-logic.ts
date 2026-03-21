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

import moment from 'moment';

import type { EmitterWebhookEvent } from '@octokit/webhooks';
import { inject, injectable, named } from 'inversify';

import { AddLabelHelper } from '/@/helpers/add-label-helper';
import { IssuesHelper } from '/@/helpers/issue-helper';
import type { PushListener } from '/@/api/push-listener';

@injectable()
export class ApplyTriageOnIssuesLogic implements PushListener {
  @inject('number')
  @named('MAX_SET_ISSUES_PER_RUN')
  private maxSetMIssuesPerRun: number;

  @inject(IssuesHelper)
  private issuesHelper: IssuesHelper;

  @inject(AddLabelHelper)
  private addLabelHelper: AddLabelHelper;

  async wait(ms: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

  async execute(_event: EmitterWebhookEvent<'push'>): Promise<void> {
    // Get all recent issues
    const issues = await this.issuesHelper.getRecentIssues(moment.duration(1, 'hour'));

    // If they already have an area, skip it
    // If it contains needs/triage, skip it as well
    const filteredIssues = issues.filter(issue => {
      const labels = issue.labels;
      const hasArea = labels.find(label => label.startsWith('area/'));
      const hasNeedsTriage = labels.find(label => label === 'status/need-triage');
      return !hasArea && !hasNeedsTriage;
    });

    // Now that we have, issues
    // Add the status/need-triage label
    console.log(`status/need-triage issues to set: ${filteredIssues.length}`);

    if (filteredIssues.length > this.maxSetMIssuesPerRun) {
      filteredIssues.length = this.maxSetMIssuesPerRun;
      console.log(
        `status/need-triage issues to set > ${this.maxSetMIssuesPerRun}, keep only ${this.maxSetMIssuesPerRun} for this run`,
      );
    }

    // Apply label
    // Do update of milestones in all repositories
    for (const entry of filteredIssues) {
      // Do not flush too many calls at once on github
      await this.wait(500);
      await this.addLabelHelper.addLabel(['status/need-triage'], entry);
    }
  }
}
