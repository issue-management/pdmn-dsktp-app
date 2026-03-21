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

import { ContainerModule } from 'inversify';

import { AssignReviewersOnPullRequestLogic } from './assign-reviewers-on-pull-request-logic';
import { DomainReviewCheckRunLogic } from './domain-review-check-run-logic';
import { PullRequestOpenedListener } from '/@/api/pull-request-opened-listener';
import { PullRequestEditedListener } from '/@/api/pull-request-edited-listener';
import { PullRequestReviewListener } from '/@/api/pull-request-review-listener';

const logicModule = new ContainerModule(({ bind }) => {
  /* eslint-disable sonarjs/no-commented-code */
  /*
  Commented
  bind(ApplyProjectsOnIssuesLogic).to(ApplyProjectsOnIssuesLogic).inSingletonScope();
  bind(PushListener).toService(ApplyProjectsOnIssuesLogic);

  bind(ApplyTriageOnIssuesLogic).to(ApplyTriageOnIssuesLogic).inSingletonScope();
  bind(PushListener).toService(ApplyTriageOnIssuesLogic);

  bind(ApplyMilestoneOnPullRequestsLogic).to(ApplyMilestoneOnPullRequestsLogic).inSingletonScope();
  bind(PushListener).toService(ApplyMilestoneOnPullRequestsLogic);

  bind(ApproveAndMergeDependabotPRLogic).to(ApproveAndMergeDependabotPRLogic).inSingletonScope();
  bind(PushListener).toService(ApproveAndMergeDependabotPRLogic);

  bind(DisplayIssuesOpenedLogic).to(DisplayIssuesOpenedLogic).inSingletonScope();
  bind(IssuesOpenedListener).toService(DisplayIssuesOpenedLogic);

  bind(DisplayIssuesClosedLogic).to(DisplayIssuesClosedLogic).inSingletonScope();
  bind(IssuesClosedListener).toService(DisplayIssuesClosedLogic);

  bind(DisplayIssuesAllLogic).to(DisplayIssuesAllLogic).inSingletonScope();
  bind(IssuesReopenedListener).toService(DisplayIssuesAllLogic);
  bind(IssuesOpenedListener).toService(DisplayIssuesAllLogic);
*/
  bind(DomainReviewCheckRunLogic).to(DomainReviewCheckRunLogic).inSingletonScope();
  bind(PullRequestReviewListener).toService(DomainReviewCheckRunLogic);

  bind(AssignReviewersOnPullRequestLogic).to(AssignReviewersOnPullRequestLogic).inSingletonScope();
  bind(PullRequestOpenedListener).toService(AssignReviewersOnPullRequestLogic);
  bind(PullRequestEditedListener).toService(AssignReviewersOnPullRequestLogic);
});

export { logicModule };
