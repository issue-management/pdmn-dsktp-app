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

import { AddLabelHelper } from './add-label-helper';
import { CheckRunHelper } from './check-run-helper';
import { CommentHelper } from './comment-helper';
import { DependencyChangeAnalyzer } from './dependency-change-analyzer';
import { DependencyDomainsResolver } from './dependency-domains-resolver';
import { DetectDomainsHelper } from './detect-domains-helper';
import { DomainsHelper } from './domains-helper';
import { FolderDomainsHelper } from './folder-domains-helper';
import { IssueMilestoneHelper } from './issue-milestone-helper';
import { IssuesHelper } from './issue-helper';
import { MaintainerHelper } from './maintainer-helper';
import { MergedPrCounterHelper } from './merged-pr-counter-helper';
import { MilestoneBadgeHelper } from './milestone-badge-helper';
import { MilestoneHelper } from './milestone-helper';
import { ProjectsHelper } from './projects-helper';
import { PullRequestFilesHelper } from './pull-request-files-helper';
import { PullRequestReviewsHelper } from './pr-review-helper';
import { PullRequestsHelper } from './pull-requests-helper';
import { RemoveLabelHelper } from './remove-label-helper';
import { RepositoriesHelper } from './repositories-helper';
import { TagsHelper } from './tags-helper';

const helpersModule = new ContainerModule(({ bind }) => {
  bind(AddLabelHelper).toSelf().inSingletonScope();
  bind(CheckRunHelper).toSelf().inSingletonScope();
  bind(CommentHelper).toSelf().inSingletonScope();
  bind(DependencyChangeAnalyzer).toSelf().inSingletonScope();
  bind(DependencyDomainsResolver).toSelf().inSingletonScope();
  bind(DetectDomainsHelper).toSelf().inSingletonScope();
  bind(DomainsHelper).toSelf().inSingletonScope();
  bind(FolderDomainsHelper).toSelf().inSingletonScope();
  bind(IssuesHelper).toSelf().inSingletonScope();
  bind(IssueMilestoneHelper).toSelf().inSingletonScope();
  bind(MaintainerHelper).toSelf().inSingletonScope();
  bind(MergedPrCounterHelper).toSelf().inSingletonScope();
  bind(MilestoneBadgeHelper).toSelf().inSingletonScope();
  bind(MilestoneHelper).toSelf().inSingletonScope();
  bind(PullRequestFilesHelper).toSelf().inSingletonScope();
  bind(PullRequestsHelper).toSelf().inSingletonScope();
  bind(RemoveLabelHelper).toSelf().inSingletonScope();
  bind(TagsHelper).toSelf().inSingletonScope();
  bind(ProjectsHelper).toSelf().inSingletonScope();
  bind(RepositoriesHelper).toSelf().inSingletonScope();
  bind(PullRequestReviewsHelper).toSelf().inSingletonScope();
});

export { helpersModule };
