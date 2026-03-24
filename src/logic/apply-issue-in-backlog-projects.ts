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
import { inject, injectable } from 'inversify';

import type { IssuesOpenedListener } from '/@/api/issues-opened-listener';
import { ProjectsHelper } from '/@/helpers/projects-helper';
import { RepositoriesHelper } from '/@/helpers/repositories-helper';
import { IssueInfo } from '/@/info/issue-info';

@injectable()
export class ApplyProjectsOnIssuesLogic implements IssuesOpenedListener {
  @inject(ProjectsHelper)
  private projectsHelper: ProjectsHelper;

  @inject(RepositoriesHelper)
  private repositoriesHelper: RepositoriesHelper;

  async execute(event: EmitterWebhookEvent<'issues.opened'>): Promise<void> {
    const owner = event.payload.repository.owner.login;
    const repo = event.payload.repository.name;

    if (!this.repositoriesHelper.isKnownRepository(owner, repo)) {
      console.log(`ApplyProjectsOnIssues: Skipping issue from unknown repository ${owner}/${repo}`);
      return;
    }

    const issue = event.payload.issue;

    const issueInfo = new IssueInfo()
      .withId(issue.node_id)
      .withOwner(owner)
      .withRepo(repo)
      .withNumber(issue.number)
      .withLabels(issue.labels?.map(label => (typeof label === 'string' ? label : (label.name ?? ''))) ?? [])
      .withHtmlLink(issue.html_url)
      .withProjectItems([]);

    await this.projectsHelper.setBacklogProjects(issueInfo);
  }
}
