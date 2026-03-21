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

import type { IssueInfo } from '/@/info/issue-info';
import { graphql } from '@octokit/graphql';

@injectable()
export class ProjectsHelper {
  @inject('string')
  @named('GRAPHQL_WRITE_TOKEN')
  private graphqlWriteToken: string;

  public async setBacklogProjects(issueInfo: IssueInfo): Promise<void> {
    // Search if milestone is already defined

    // Add the issue to the project
    const query = `
    mutation($projectId:ID!, $contentId:ID!) {
      addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
        item {
          id
        }
      }
    }
`;
    // Id of projects planning
    const projectId = 'PVT_kwDOB71_hM4AxfY6';
    const contentId = issueInfo.id;
    const graphQlResponse = await graphql<{ addProjectV2ItemById: { item: { id: string } } }>(query, {
      projectId: projectId,
      contentId: contentId,
      headers: {
        authorization: this.graphqlWriteToken,
      },
    });

    const itemId = graphQlResponse.addProjectV2ItemById.item.id;

    const querySetProject = `
mutation (
  $projectId: ID!
  $itemId: ID!
  $statusField: ID!
  $statusValue: String!
) {
  set_status: updateProjectV2ItemFieldValue(input: {
    projectId: $projectId
    itemId: $itemId
    fieldId: $statusField
    value: { 
      singleSelectOptionId: $statusValue
      }
  }) {
    projectV2Item {
      id
      }
  }
}
`;

    await graphql(querySetProject, {
      projectId: projectId,
      itemId: itemId,
      // This is for Status
      statusField: 'PVTSSF_lADOB71_hM4AxfY6zgnmBDo',
      // This is for backlog
      statusValue: 'bd2b3a2d',
      headers: {
        authorization: this.graphqlWriteToken,
      },
    });
  }
}
