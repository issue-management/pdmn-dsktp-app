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
import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';
import { graphql } from '@octokit/graphql';

interface MilestoneSearchEdge {
  node: {
    name: string;
    url: string;
    owner: { login: string };
    milestones: {
      totalCount: number;
      pageInfo: {
        endCursor: string;
        hasNextPage: boolean;
      };
      nodes: {
        title: string;
        number: number;
        description?: string;
        state: string;
        dueOn?: string;
      }[];
    };
  };
}

interface GraphQLMilestoneSearchResponse {
  search: {
    pageInfo: {
      endCursor: string;
      hasNextPage: boolean;
    };
    repositoryCount: number;
    edges: MilestoneSearchEdge[];
  };
}

export interface MilestoneDefinition {
  //
  // {
  // "title": "7.20",
  // "number": 125,
  // "description": "Release (7.y.0) runs on Wednesday after the sprint ends, with weekly 7.y.z releases (as needed) for the 2 weeks thereafter, also on Wednesday.",
  // "dueOn": "2020-10-07T00:00:00Z",
  // "state": "OPEN"
  // }
  title: string;
  number: number;
  description?: string;
  dueOn?: string;
  state: 'open' | 'closed';
}

@injectable()
export class MilestoneHelper {
  @inject('string')
  @named('GRAPHQL_READ_TOKEN')
  private graphqlReadToken: string;

  @inject('Octokit')
  @named('WRITE_TOKEN')
  private octokitWrite: Octokit;

  public async createMilestone(
    repoOwner: string,
    repoName: string,
    milestoneDefinition: MilestoneDefinition,
  ): Promise<void> {
    // Create milestone on the repo
    const issuesCreateMilestoneParams: RestEndpointMethodTypes['issues']['createMilestone']['parameters'] = {
      owner: repoOwner,
      repo: repoName,
      title: milestoneDefinition.title,
      state: milestoneDefinition.state,
    };
    if (milestoneDefinition.description !== undefined) {
      issuesCreateMilestoneParams.description = milestoneDefinition.description;
    }

    if (milestoneDefinition.dueOn !== undefined) {
      issuesCreateMilestoneParams.due_on = milestoneDefinition.dueOn;
    }

    console.log('Create milestone with params', issuesCreateMilestoneParams);
    await this.octokitWrite.rest.issues.createMilestone(issuesCreateMilestoneParams);
  }

  public async updateMilestone(
    repoOwner: string,
    repoName: string,
    milestoneDefinition: MilestoneDefinition,
  ): Promise<void> {
    // Create milestone on the repo
    const issuesUpdateMilestoneParams: RestEndpointMethodTypes['issues']['updateMilestone']['parameters'] = {
      owner: repoOwner,
      repo: repoName,
      milestone_number: milestoneDefinition.number,
      title: milestoneDefinition.title,
      state: milestoneDefinition.state,
    };

    if (milestoneDefinition.description !== undefined) {
      issuesUpdateMilestoneParams.description = milestoneDefinition.description;
    }

    if (milestoneDefinition.dueOn !== undefined) {
      issuesUpdateMilestoneParams.due_on = milestoneDefinition.dueOn;
    }
    console.log('Update milestone with params', issuesUpdateMilestoneParams);
    await this.octokitWrite.rest.issues.updateMilestone(issuesUpdateMilestoneParams);
  }

  public async searchMilestones(repositories: string[]): Promise<Map<string, Map<string, MilestoneDefinition>>> {
    // Add repo: prefix on repositories
    const queryRepositories = repositories.map(repository => `repo:${repository}`).join(' ');
    const milestoneSearch = await this.doSearchMilestones(queryRepositories);

    // Received array of edges looking like:
    //
    // [
    //   {
    //     "node": {
    //       "name": "che",
    //       "url": "https://github.com/eclipse/che",
    //       "owner": {
    //         "login": "eclipse"
    //       },
    //       "milestones": {
    //         "nodes": [
    //           {
    //             "title": "8.x",
    //             "id": "MDk6TWlsZXN0b25lNTY0OTcwMA==",
    //             "closed": false,
    //             "dueOn": null
    //           },

    const milestones: Map<string, Map<string, MilestoneDefinition>> = new Map();

    milestoneSearch.forEach(item => {
      // Get short repository name
      const repoName = `${item.node.owner.login}/${item.node.name}`;

      // Create map
      const milestoneMap: Map<string, MilestoneDefinition> = new Map();

      // For every nodes, add milestone
      item.node.milestones.nodes.forEach(milestoneNode => {
        const definition: MilestoneDefinition = {
          title: milestoneNode.title,
          number: milestoneNode.number,
          description: milestoneNode.description,
          dueOn: milestoneNode.dueOn,
          state: milestoneNode.state.toLowerCase() as 'open' | 'closed',
        };
        milestoneMap.set(milestoneNode.title, definition);
      });
      const existing = milestones.get(repoName) ?? new Map();
      milestones.set(repoName, new Map([...milestoneMap, ...existing]));
    });

    return milestones;
  }

  protected async doSearchMilestones(
    queryRepositories: string,
    cursorRepository?: string,
    cursorMilestones?: string,
    previousMilestones?: MilestoneSearchEdge[],
  ): Promise<MilestoneSearchEdge[]> {
    const query = `
    query getMilestones($queryRepositories: String!, $cursorRepositoryAfter: String, $cursorMilestoneAfter: String){
      rateLimit{
       cost
       remaining
       resetAt
      }
      search(query:$queryRepositories, type:REPOSITORY, first:100, after: $cursorRepositoryAfter){  
       pageInfo {
               ... on PageInfo {
                 endCursor
                 hasNextPage
               }
             }
       repositoryCount
       edges{
        node{
         ... on Repository{
          name
          url
          owner{
           login
          }
          milestones(first:50, after: $cursorMilestoneAfter, orderBy: {field: CREATED_AT, direction: DESC}) {
            totalCount
            pageInfo {
              ... on PageInfo {
                endCursor
                hasNextPage
              }
            }
            nodes {
             ... on Milestone {
               title,
               number,
               description,
               state,
               dueOn,
               
             }
           }
         } 
         }
        }
       }
      }
     }
    `;

    const graphQlResponse = await graphql<GraphQLMilestoneSearchResponse>(query, {
      queryRepositories: queryRepositories,
      cursorRepositoryAfter: cursorRepository,
      cursorMilestoneAfter: cursorMilestones,
      headers: {
        authorization: this.graphqlReadToken,
      },
    });

    let allGraphQlResponse;
    if (previousMilestones) {
      allGraphQlResponse = previousMilestones.concat(graphQlResponse.search.edges);
    } else {
      allGraphQlResponse = graphQlResponse.search.edges;
    }

    // Need to loop again on milestones before looping on repositories
    const milestonesWithNextCursors: string[] = graphQlResponse.search.edges
      .map(edge => {
        if (edge.node.milestones.pageInfo?.hasNextPage) {
          return edge.node.milestones.pageInfo.endCursor;
        }
        return undefined;
      })
      .filter((value): value is string => value !== undefined);
    let nextCursorMilestone;
    if (milestonesWithNextCursors.length > 0) {
      nextCursorMilestone = milestonesWithNextCursors[0];
    }

    if (nextCursorMilestone) {
      // Needs to redo the search starting from the last search
      return await this.doSearchMilestones(
        queryRepositories,
        cursorRepository,
        nextCursorMilestone,
        allGraphQlResponse,
      );
    }
    if (graphQlResponse.search.pageInfo.hasNextPage) {
      // Needs to redo the search starting from the last search
      return await this.doSearchMilestones(
        queryRepositories,
        graphQlResponse.search.pageInfo.endCursor,
        cursorMilestones,
        allGraphQlResponse,
      );
    }

    // From reverse order
    allGraphQlResponse.reverse();
    return allGraphQlResponse;
  }
}
