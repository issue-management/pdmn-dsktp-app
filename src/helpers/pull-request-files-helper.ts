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
 ******************************************************************************/

import { inject, injectable, named } from 'inversify';

import type { Octokit } from '@octokit/rest';

export interface PullRequestFile {
  filename: string;
  status: string;
}

@injectable()
export class PullRequestFilesHelper {
  @inject('Octokit')
  @named('WRITE_TOKEN')
  private octokit: Octokit;

  public async listFiles(owner: string, repo: string, pullNumber: number): Promise<PullRequestFile[]> {
    const files: PullRequestFile[] = [];
    let page = 1;
    const perPage = 100;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response = await this.octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: perPage,
        page,
      });

      for (const file of response.data) {
        files.push({
          filename: file.filename,
          status: file.status ?? 'unknown',
        });
      }

      if (response.data.length < perPage) {
        break;
      }
      page++;
    }

    return files;
  }

  public isOnlyDependencyFiles(files: PullRequestFile[]): boolean {
    if (files.length === 0) {
      return false;
    }
    return files.every(
      f => f.filename.endsWith('/package.json') || f.filename === 'package.json' || f.filename === 'pnpm-lock.yaml',
    );
  }

  public getChangedPackageJsonPaths(files: PullRequestFile[]): string[] {
    return files
      .filter(f => f.filename.endsWith('/package.json') || f.filename === 'package.json')
      .map(f => f.filename);
  }
}
