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

import { type IssueInfo, IssueInfoBuilder } from '/@/info/issue-info';
import { inject, injectable, named } from 'inversify';

import type { Octokit } from '@octokit/rest';
import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';
import { graphql } from '@octokit/graphql';

interface IssueSearchEdge {
  node: {
    createdAt: string;
    url: string;
    id: string;
    number: number;
    labels?: {
      nodes?: { name?: string }[];
    };
    repository: {
      name: string;
      owner: { login: string };
    };
    projectItems?: {
      nodes?: {
        project: { id: string; title: string };
        fieldValueByName?: {
          name?: string;
          field: {
            project: { id: string; number: number };
          };
        };
      }[];
    };
  };
}

interface GraphQLSearchResponse {
  search: {
    pageInfo: {
      endCursor: string;
      hasNextPage: boolean;
    };
    edges: IssueSearchEdge[];
  };
}

@injectable()
export class IssuesHelper {
  @inject(IssueInfoBuilder)
  private issueInfoBuilder: IssueInfoBuilder;

  @inject('Octokit')
  @named('READ_TOKEN')
  private octokit: Octokit;

  @inject('string')
  @named('GRAPHQL_READ_TOKEN')
  private graphqlReadToken: string;

  public async isFirstTime(issueInfo: IssueInfo): Promise<boolean> {
    const issuesListParams: RestEndpointMethodTypes['issues']['listForRepo']['parameters'] = {
      creator: issueInfo.author,
      state: 'all',
      owner: issueInfo.owner,
      repo: issueInfo.repo,
    };

    const response = await this.octokit.rest.issues.listForRepo(issuesListParams);
    return response.data.length === 0;
  }

  public async getRecentIssues(duration: moment.Duration): Promise<IssueInfo[]> {
    const afterDate = moment(new Date()).utc().subtract(duration).toISOString();

    const queryString = `repo:podman-desktop/podman-desktop is:issue created:>=${afterDate}`;
    const lastNewIssuesSearch = await this.doGetRecentIssues(queryString);

    // Received array of edges looking like:
    //
    // [
    //   {
    //     "node": {
    //       "url": "https://github.com/podman-desktop/podman-desktop/issues/514",
    //       "number": 514,
    //       "repository": {
    //         "name": "podman-desktop",
    //         "owner": {
    //           "login": "containers"
    //         }
    //       },
    // "projectItems": {
    //   "nodes": [
    //     {
    //       "project": {
    //         "id": "PVT_kwDOAFmk9s4ACTx2",
    //         "title": "Podman Desktop Planning"
    //       },
    //       "fieldValueByName": {
    //         "name": "📋 Backlog",
    //         "field": {
    //           "project": {
    //             "id": "PVT_kwDOAFmk9s4ACTx2",
    //             "number": 4
    //           }
    //         }
    //       }
    //     }
    //   ],
    //   "totalCount": 1
    // "labels": {
    //   "nodes": [
    //     {
    //       "name": "kind/epic",
    //       "color": "C9BB01"
    //     },
    //     {
    //       "name": "theme/kubernetes",
    //       "color": "4A802D"
    //     }
    //   ]
    // },
    //       "milestone": null
    //     }
    //   },
    // ]
    //"projectItems": {
    //   "nodes": [
    //     {
    //       "project": {
    //         "id": "PVT_kwDOAFmk9s4ACTx2",
    //         "title": "Podman Desktop Planning"
    //       },
    //       "fieldValueByName": {
    //         "name": "📋 Backlog",
    //         "field": {
    //           "project": {
    //             "id": "PVT_kwDOAFmk9s4ACTx2",
    //             "number": 4
    //           }
    //         }
    //       }
    //     }
    //   ],

    const issues: IssueInfo[] = lastNewIssuesSearch.map(item =>
      this.issueInfoBuilder
        .build()
        .withCreatedAt(item.node.createdAt)
        .withLabels(
          item.node.labels?.nodes?.map(label => label?.name).filter((name): name is string => name !== undefined) ?? [],
        )
        .withNumber(item.node.number)
        .withRepo(item.node.repository.name)
        .withOwner(item.node.repository.owner.login)
        .withHtmlLink(item.node.url)
        .withId(item.node.id)
        .withProjectItems(
          item.node.projectItems?.nodes
            ?.filter(
              (
                nodeItem,
              ): nodeItem is typeof nodeItem & {
                fieldValueByName: { name: string; field: { project: { number: number } } };
              } => nodeItem?.fieldValueByName?.name !== undefined,
            )
            .map(nodeItem => ({
              name: nodeItem.fieldValueByName.name,
              projectId: nodeItem.project.id,
              projectNumber: String(nodeItem.fieldValueByName.field.project.number),
            })) ?? [],
        ),
    );

    return issues;
  }

  protected async doGetRecentIssues(
    queryString: string,
    cursor?: string,
    previousMilestones?: IssueSearchEdge[],
  ): Promise<IssueSearchEdge[]> {
    const query = `
      query getRecentIssues($queryString: String!, $cursorAfter: String) {
        rateLimit {
          cost
          remaining
          resetAt
        }
        search(query: $queryString, type: ISSUE, first: 100, after: $cursorAfter) {
          pageInfo {
            ... on PageInfo {
              endCursor
              hasNextPage
            }
          }
          edges {
            node {
              ... on Issue {
                url
                id
                number
                createdAt
                labels(first: 100) {
                  nodes {
                    ... on Label {
                      name
                      color
                    }
                  }
                }
                repository {
                  name
                  owner {
                    login
                  }
                }
                projectItems(first: 10) {
                  nodes {
                    project {
                      id
                      title
                    }
                    fieldValueByName(name: "Status") {
                      ... on ProjectV2ItemFieldSingleSelectValue {
                        name
                        field {
                          ... on ProjectV2SingleSelectField {
                            project {
                              ... on ProjectV2 {
                                id
                                number
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                  totalCount
                }
                milestone {
                  number
                }
              }
            }
          }
        }
      }
    `;

    const graphQlResponse = await graphql<GraphQLSearchResponse>(query, {
      queryString: queryString,
      cursorAfter: cursor,
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

    // Need to loop again
    if (graphQlResponse.search.pageInfo.hasNextPage) {
      // Needs to redo the search starting from the last search
      return await this.doGetRecentIssues(queryString, graphQlResponse.search.pageInfo.endCursor, allGraphQlResponse);
    }

    return allGraphQlResponse;
  }

  public async getIssue(issueLink: string): Promise<IssueInfo | undefined> {
    const parsingRegexp = /(?:\/repos\/)([^/]+)\/([^/]+)(?:\/issues\/)(\d+)/g;

    const parsing = parsingRegexp.exec(issueLink);

    if (parsing?.length !== 4) {
      return undefined;
    }

    const issueGetParam: RestEndpointMethodTypes['issues']['get']['parameters'] = {
      owner: parsing[1],
      repo: parsing[2],
      issue_number: Number.parseInt(parsing[3]),
    };

    const response = await this.octokit.rest.issues.get(issueGetParam);
    const issueGetReponse = response.data;

    const labels: string[] = issueGetReponse.labels.map(label =>
      typeof label === 'string' ? label : (label.name ?? ''),
    );

    return this.issueInfoBuilder
      .build()
      .withBody(issueGetReponse.body ?? '')
      .withAuthor(issueGetReponse.user?.login ?? '')
      .withHtmlLink(issueGetReponse.html_url)
      .withNumber(issueGetReponse.number)
      .withOwner(issueGetParam.owner)
      .withRepo(issueGetParam.repo)
      .withLabels(labels);
  }
}
