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

import { inject, injectable } from 'inversify';

import { IssueInfo } from './issue-info';
import { IssuesHelper } from '/@/helpers/issue-helper';
import { PullRequestInfoLinkedIssuesExtractor } from './pull-request-info-linked-issues-extractor';

export type StatusState = 'SUCCESS' | 'FAILURE' | 'ERROR' | 'PENDING' | 'EXPECTED' | 'UNEXPECTED' | 'UNKNOWN';

export type ReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | 'PENDING';
export class PullRequestInfo extends IssueInfo {
  private __merged: boolean;
  private __mergingBranch: string;
  private __mergedAt: string;

  private __linkedIssues: IssueInfo[] = [];

  private __statusState: StatusState;

  private __reviewState: ReviewState;

  private __title: string;

  private __age: string;

  private __lastCommitDate: string;

  private __autoMergeEnabled = false;

  public withLinkedIssues(linkedIssues: IssueInfo[]): PullRequestInfo {
    this.__linkedIssues = linkedIssues;
    return this;
  }

  public withLastCommitDate(lastCommitDate: string): PullRequestInfo {
    this.__lastCommitDate = lastCommitDate;
    return this;
  }

  public computeAge(): PullRequestInfo {
    const lastCommitDate = new Date(this.__lastCommitDate);
    // Use momentjs to do the diff
    const valDuration = moment.duration(moment().diff(moment(lastCommitDate)));

    this.__age = `${valDuration.humanize()}`;
    return this;
  }

  public withAge(age: string): PullRequestInfo {
    this.__age = age;
    return this;
  }

  public get age(): string {
    return this.__age;
  }

  public withMergedState(merged: boolean): PullRequestInfo {
    this.__merged = merged;
    return this;
  }

  public withMergingBranch(mergingBranch: string): PullRequestInfo {
    this.__mergingBranch = mergingBranch;
    return this;
  }

  public withMergedAt(mergedAt: string): PullRequestInfo {
    this.__mergedAt = mergedAt;
    return this;
  }

  public get lastCommitDate(): string {
    return this.__lastCommitDate;
  }

  public get linkedIssues(): IssueInfo[] {
    return this.__linkedIssues;
  }

  public get mergingBranch(): string {
    return this.__mergingBranch;
  }

  public get mergedAt(): string {
    return this.__mergedAt;
  }

  public get merged(): boolean {
    return this.__merged;
  }

  public get statusState(): StatusState {
    return this.__statusState;
  }

  public get reviewState(): ReviewState {
    return this.__reviewState;
  }

  public get title(): string {
    return this.__title;
  }

  public withStatusState(statusState: StatusState): PullRequestInfo {
    this.__statusState = statusState;
    return this;
  }

  public withReviewState(reviewState: ReviewState): PullRequestInfo {
    this.__reviewState = reviewState;
    return this;
  }

  public withTitle(title: string): PullRequestInfo {
    this.__title = title;
    return this;
  }

  public get autoMergeEnabled(): boolean {
    return this.__autoMergeEnabled;
  }

  public withAutoMergeEnabled(autoMergeEnabled: boolean): PullRequestInfo {
    this.__autoMergeEnabled = autoMergeEnabled;
    return this;
  }
}

@injectable()
export class PullRequestInfoBuilder {
  @inject(PullRequestInfoLinkedIssuesExtractor)
  private pullRequestInfoLinkedIssuesExtractor: PullRequestInfoLinkedIssuesExtractor;

  @inject(IssuesHelper)
  private issuesHelper: IssuesHelper;

  async resolve(pullRequestInfo: PullRequestInfo): Promise<void> {
    const extractedLinkedIssues = this.pullRequestInfoLinkedIssuesExtractor.extract(pullRequestInfo);
    const linkedIssues: IssueInfo[] = [];
    // Grab labels on the linked issues
    for (const extractedLinkedIssue of extractedLinkedIssues) {
      const linkedIssueInfo = await this.issuesHelper.getIssue(extractedLinkedIssue);
      if (linkedIssueInfo) {
        linkedIssues.push(linkedIssueInfo);
      }
    }
    pullRequestInfo.withLinkedIssues(linkedIssues);
  }

  build(): PullRequestInfo {
    return new PullRequestInfo();
  }
}
