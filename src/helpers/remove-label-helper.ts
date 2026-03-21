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

@injectable()
export class RemoveLabelHelper {
  @inject('Octokit')
  @named('WRITE_TOKEN')
  private octokit: Octokit;

  public async removeLabel(label: string, issueInfo: IssueInfo): Promise<void> {
    // Only remove if the label is currently on the issue
    if (!issueInfo.hasLabel(label)) {
      return;
    }

    await this.octokit.rest.issues.removeLabel({
      issue_number: issueInfo.number,
      name: label,
      owner: issueInfo.owner,
      repo: issueInfo.repo,
    });
  }
}
