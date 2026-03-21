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

import { IssuesHelper } from '/@/helpers/issue-helper';
import { ProjectsHelper } from '/@/helpers/projects-helper';
import type { PushListener } from '/@/api/push-listener';

@injectable()
export class ApplyProjectsOnIssuesLogic implements PushListener {
  @inject('number')
  @named('MAX_SET_ISSUES_PER_RUN')
  private maxSetMIssuesPerRun: number;

  @inject(IssuesHelper)
  private issuesHelper: IssuesHelper;

  @inject(ProjectsHelper)
  private projectsHelper: ProjectsHelper;

  async wait(ms: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

  async execute(_event: EmitterWebhookEvent<'push'>): Promise<void> {
    // Get all recent issues
    const issues = await this.issuesHelper.getRecentIssues(moment.duration(1, 'hour'));

    // Already in the planning project, skip it
    const filteredIssues = issues.filter(
      issue => !issue.projectItems.some(projectItem => projectItem.projectId === 'PVT_kwDOB71_hM4AxfY6'),
    );

    // Now that we have issues
    // Sets the project planning with backlog column
    console.log(`issues to set planning project: ${filteredIssues.length}`);

    if (filteredIssues.length > this.maxSetMIssuesPerRun) {
      filteredIssues.length = this.maxSetMIssuesPerRun;
      console.log(
        `issues to set planning project > ${this.maxSetMIssuesPerRun}, keep only ${this.maxSetMIssuesPerRun} for this run`,
      );
    }

    if (filteredIssues.length > 0) {
      filteredIssues.length = 1;
    }

    // Apply label
    // Do update of milestones in all repositories
    for (const entry of filteredIssues) {
      // Do not flush too many calls at once on github
      await this.wait(500);
      await this.projectsHelper.setBacklogProjects(entry);
    }
  }
}
