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

import { type PullRequestInfo, PullRequestInfoBuilder } from '/@/info/pull-request-info';
import { inject, injectable, named } from 'inversify';

import type { Octokit } from '@octokit/rest';
import { graphql } from '@octokit/graphql';

interface PullRequestSearchEdge {
  node: {
    url: string;
    mergedAt: string;
    number: number;
    repository: {
      name: string;
      owner: {
        login: string;
      };
    };
    baseRefName: string;
  };
}

interface GraphQLPullRequestSearchResponse {
  search: {
    pageInfo: {
      endCursor: string;
      hasNextPage: boolean;
    };
    edges: PullRequestSearchEdge[];
  };
}

@injectable()
export class PullRequestsHelper {
  @inject('string')
  @named('GRAPHQL_READ_TOKEN')
  private graphqlReadToken: string;

  @inject('Octokit')
  @named('WRITE_TOKEN')
  private octokit: Octokit;

  @inject(PullRequestInfoBuilder)
  private pullRequestInfoBuilder: PullRequestInfoBuilder;

  public async listReviews(
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<{ user: string; state: string }[]> {
    const response = await this.octokit.rest.pulls.listReviews({
      owner,
      repo,
      pull_number: pullNumber,
    });
    return response.data.map(review => ({
      user: review.user?.login ?? '',
      state: review.state,
    }));
  }

  public async requestReviewers(owner: string, repo: string, pullNumber: number, reviewers: string[]): Promise<void> {
    if (reviewers.length === 0) return;
    await this.octokit.rest.pulls.requestReviewers({
      owner,
      repo,
      pull_number: pullNumber,
      reviewers,
    });
  }

  public async getRecentMerged(duration: moment.Duration): Promise<PullRequestInfo[]> {
    const afterDate = moment(new Date()).utc().subtract(duration).toISOString();

    const queryString = `repo:podman-desktop/podman-desktop is:pr merged:>=${afterDate} is:merged no:milestone`;
    console.log('Query String =', queryString);
    const lastMergedPullRequestSearch = await this.doGetRecentMerged(queryString);

    // Received array of edges looking like:
    //
    // [
    //       {
    //         "node": {
    //           "url": "https://github.com/eclipse/che-docs/pull/1450",
    //           "mergedAt": "2020-08-06T12:52:47Z",
    //           "repository": {
    //             "name": "che-docs",
    //             "owner": {
    //               "login": "eclipse"
    //             }
    //           },
    //           "baseRepository": {
    //             "url": "https://github.com/eclipse/che-docs",
    //             "nameWithOwner": "eclipse/che-docs"
    //           },
    //           "baseRefName": "master",
    //           "milestone": null
    //         }
    //       },

    const pullRequests: PullRequestInfo[] = lastMergedPullRequestSearch.map((item: PullRequestSearchEdge) =>
      this.pullRequestInfoBuilder
        .build()
        .withMergedAt(item.node.mergedAt)
        .withNumber(item.node.number)
        .withRepo(item.node.repository.name)
        .withOwner(item.node.repository.owner.login)
        .withHtmlLink(item.node.url)
        .withMergingBranch(item.node.baseRefName),
    );

    return pullRequests;
  }

  protected async doGetRecentMerged(
    queryString: string,
    cursor?: string,
    previousMilestones?: PullRequestSearchEdge[],
  ): Promise<PullRequestSearchEdge[]> {
    const query = `
    query getMergedPRs($queryString: String!, $cursorAfter: String) {
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
            ... on PullRequest {
              url
              mergedAt
              number
              repository {
                name
                owner {
                  login
                }
              }
              baseRepository {
                url
                nameWithOwner
              }
              baseRefName
              milestone {
                number
              }
            }
          }
        }
      }
    }
    `;

    const graphQlResponse = await graphql<GraphQLPullRequestSearchResponse>(query, {
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
      return await this.doGetRecentMerged(queryString, graphQlResponse.search.pageInfo.endCursor, allGraphQlResponse);
    }

    return allGraphQlResponse;
  }
}
