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

import { inject, injectable, named } from 'inversify';

import type { Octokit } from '@octokit/rest';
import type { IssueInfo } from '/@/info/issue-info';
import type { PullRequestInfo } from '/@/info/pull-request-info';
import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';

@injectable()
export class IssueMilestoneHelper {
  @inject('Octokit')
  @named('WRITE_TOKEN')
  private octokitWrite: Octokit;

  @inject('Octokit')
  @named('READ_TOKEN')
  private octokitRead: Octokit;

  public async setMilestone(milestone: string, issueInfo: IssueInfo | PullRequestInfo): Promise<void> {
    // Search if milestone is already defined

    // Search milestone on the repo
    const issuesGetMilestonesParams: RestEndpointMethodTypes['issues']['listMilestones']['parameters'] = {
      per_page: 100,
      state: 'all',
      direction: 'desc',
      owner: issueInfo.owner,
      repo: issueInfo.repo,
    };

    const response = await this.octokitRead.rest.issues.listMilestones(issuesGetMilestonesParams);
    let githubMilestone = response.data.find(
      (milestoneResponse: { title: string }) => milestoneResponse.title === milestone,
    );

    // Not defined, create it
    if (!githubMilestone) {
      const issuesCreateMilestoneParams = {
        owner: issueInfo.owner,
        repo: issueInfo.repo,
        title: milestone,
      };
      const createMilestoneResponse = await this.octokitWrite.rest.issues.createMilestone(issuesCreateMilestoneParams);
      githubMilestone = createMilestoneResponse.data;
    }

    // Grab the number
    const milestoneNumber = githubMilestone?.number;

    // Sets the milestone from the number
    const issuesUpdateParams = {
      owner: issueInfo.owner,
      repo: issueInfo.repo,
      milestone: milestoneNumber,
      issue_number: issueInfo.number,
    };
    await this.octokitWrite.rest.issues.update(issuesUpdateParams);
    console.log(`Set milestone to ${milestone} for pull request ${issueInfo.htmlLink}`);
  }
}
