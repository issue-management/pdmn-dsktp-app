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
import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';

@injectable()
export class AddLabelHelper {
  @inject('Octokit')
  @named('WRITE_TOKEN')
  private octokit: Octokit;

  public async addLabel(labelsToAdd: string[], issueInfo: IssueInfo): Promise<void> {
    // Filter labels already included
    const remainingLabelsToAdd = labelsToAdd.filter(label => !issueInfo.hasLabel(label));

    // If issue already has the label, do not trigger the add
    if (remainingLabelsToAdd.length === 0) {
      return;
    }

    const params: RestEndpointMethodTypes['issues']['addLabels']['parameters'] = {
      issue_number: issueInfo.number,
      labels: remainingLabelsToAdd,
      owner: issueInfo.owner,
      repo: issueInfo.repo,
    };

    await this.octokit.rest.issues.addLabels(params);
  }
}
