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

export const CHECK_RUN_NAME = 'Domain Review Status';

export interface CheckRunAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: 'notice' | 'warning' | 'failure';
  message: string;
  title: string;
}

const MAX_ANNOTATIONS = 50;

@injectable()
export class CheckRunHelper {
  @inject('Octokit')
  @named('WRITE_TOKEN')
  private octokit: Octokit;

  public async createOrUpdateCheckRun(
    owner: string,
    repo: string,
    headSha: string,
    status: 'in_progress' | 'completed',
    conclusion: 'success' | 'failure' | undefined,
    title: string,
    summary: string,
    text?: string,
    annotations?: CheckRunAnnotation[],
  ): Promise<void> {
    const existingId = await this.findCheckRunByName(owner, repo, headSha);

    const output = {
      title,
      summary,
      ...(text ? { text } : {}),
      ...(annotations && annotations.length > 0 ? { annotations: annotations.slice(0, MAX_ANNOTATIONS) } : {}),
    };

    if (existingId && status === 'completed') {
      await this.octokit.rest.checks.update({
        owner,
        repo,
        check_run_id: existingId,
        status,
        ...(conclusion ? { conclusion } : {}),
        output,
      });
    } else {
      await this.octokit.rest.checks.create({
        owner,
        repo,
        name: CHECK_RUN_NAME,
        head_sha: headSha,
        status,
        ...(conclusion ? { conclusion } : {}),
        output,
      });
    }
  }

  public async findCheckRunByName(owner: string, repo: string, ref: string): Promise<number | undefined> {
    const response = await this.octokit.rest.checks.listForRef({
      owner,
      repo,
      ref,
      check_name: CHECK_RUN_NAME,
    });

    if (response.data.check_runs.length > 0) {
      return response.data.check_runs[0].id;
    }
    return undefined;
  }
}
