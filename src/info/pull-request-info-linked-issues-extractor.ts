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

import type { PullRequestInfo } from './pull-request-info';
import { injectable } from 'inversify';

@injectable()
export class PullRequestInfoLinkedIssuesExtractor {
  extract(pullRequestInfo: PullRequestInfo): string[] {
    const regexpBlock = /### What issues does this PR fix or reference\?.*?###/s;
    const result = regexpBlock.exec(pullRequestInfo.body);
    if (!result) {
      return [];
    }

    const txtBlock = result[0];
    return this.extractFromText(txtBlock, pullRequestInfo.owner, pullRequestInfo.repo);
  }

  extractFromBody(body: string, owner: string, repo: string): string[] {
    return [...new Set(this.extractFromText(body, owner, repo))];
  }

  private extractFromText(text: string, owner: string, repo: string): string[] {
    const issuesFound: string[] = [];

    // Extract github issues from full URL format
    const issueLongMatch = /https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/gm;
    let issueLongMatchResult;

    while ((issueLongMatchResult = issueLongMatch.exec(text))) {
      issuesFound.push(`https://api.github.com/repos/${issueLongMatchResult[1]}/issues/${issueLongMatchResult[2]}`);
    }

    // Extract github issues from short format (#number)
    const issueShortMatch = /#(\d+)/gm;
    let issueShortMatchResult;

    while ((issueShortMatchResult = issueShortMatch.exec(text))) {
      const issue = `https://api.github.com/repos/${owner}/${repo}/issues/${issueShortMatchResult[1]}`;
      issuesFound.push(issue);
    }
    return issuesFound;
  }
}
