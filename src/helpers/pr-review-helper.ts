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

import {
  type PullRequestInfo,
  PullRequestInfoBuilder,
  type StatusState,
  type ReviewState,
} from '/@/info/pull-request-info';
import { inject, injectable, named } from 'inversify';

import { RepositoriesHelper } from './repositories-helper';
import { graphql } from '@octokit/graphql';

interface PullRequestSearchEdge {
  node: {
    id: string;
    url: string;
    mergedAt: string;
    title: string;
    number: number;
    body: string;
    repository: {
      name: string;
      owner: { login: string };
    };
    baseRepository: {
      url: string;
      nameWithOwner: string;
    };
    statusCheckRollup?: {
      state: string;
    };
    commits: {
      nodes?: {
        commit: {
          committedDate: string;
        };
      }[];
    };
    author: {
      login: string;
    };
    reviewDecision: string;
    autoMergeRequest: { enabledAt: string } | undefined;
    baseRefName: string;
    milestone?: {
      number: number;
    };
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
export class PullRequestReviewsHelper {
  @inject('string')
  @named('GRAPHQL_READ_TOKEN')
  private graphqlReadToken: string;

  @inject('string')
  @named('GRAPHQL_WRITE_TOKEN')
  private graphqlWriteToken: string;

  @inject(PullRequestInfoBuilder)
  private pullRequestInfoBuilder: PullRequestInfoBuilder;

  @inject(RepositoriesHelper)
  private repositoriesHelper: RepositoriesHelper;

  public async getDependabotPullRequestsRequiringReviewAndPassingAllChecks(): Promise<PullRequestInfo[]> {
    const repositoriesQuery = this.repositoriesHelper
      .getRepositoriesToWatch()
      .map(repo => `repo:${repo}`)
      .join(' ');
    const organizationsQuery = this.repositoriesHelper
      .getOrganizationsToWatch()
      .map(org => `org:${org}`)
      .join(' ');

    // We want to get all dependabot PRs that are open, not draft, with dependabot as author
    // Status:success is not used as it only checks the legacy commit status API, not check runs/check suites
    // Instead, we filter by statusCheckRollup after fetching
    const queryString = `${organizationsQuery} ${repositoriesQuery} is:pr is:open draft:false author:dependabot[bot]`;

    const allPullRequests = await this.getPullRequests(queryString);
    return allPullRequests.filter(pr => pr.statusState === 'SUCCESS');
  }

  public async getPullRequestsToReview(username: string): Promise<PullRequestInfo[]> {
    const repositoriesQuery = this.repositoriesHelper
      .getRepositoriesToWatch()
      .map(repo => `repo:${repo}`)
      .join(' ');
    const organizationsQuery = this.repositoriesHelper
      .getOrganizationsToWatch()
      .map(org => `org:${org}`)
      .join(' ');

    const queryString = `${organizationsQuery} ${repositoriesQuery} is:pr is:open draft:false review-requested:${username}`;
    return this.getPullRequests(queryString);
  }

  protected async getPullRequests(queryString: string): Promise<PullRequestInfo[]> {
    const lastMergedPullRequestSearch = await this.doGetPullRequestsToReview(queryString);

    const pullRequests: PullRequestInfo[] = lastMergedPullRequestSearch.map(item => {
      return this.pullRequestInfoBuilder
        .build()
        .withId(item.node.id)
        .withMergedAt(item.node.mergedAt)
        .withBody(item.node.body)
        .withNumber(item.node.number)
        .withRepo(item.node.repository.name)
        .withOwner(item.node.repository.owner.login)
        .withHtmlLink(item.node.url)
        .withTitle(item.node.title)
        .withMergingBranch(item.node.baseRefName)
        .withStatusState((item.node.statusCheckRollup?.state ?? 'UNKNOWN') as StatusState)
        .withReviewState(item.node.reviewDecision as ReviewState)
        .withAuthor(item.node.author.login)
        .withAutoMergeEnabled(item.node.autoMergeRequest !== undefined)
        .withLastCommitDate(item.node.commits.nodes?.[0]?.commit?.committedDate ?? '')
        .computeAge();
    });

    return pullRequests;
  }

  public async approvePullRequest(pullRequest: PullRequestInfo): Promise<void> {
    const mutation = `
    mutation approvePullRequest($pullRequestId: ID!) {
      addPullRequestReview(input: { pullRequestId: $pullRequestId, event: APPROVE }) {
        pullRequestReview {
          state
        }
      }
    }
    `;

    await graphql(mutation, {
      pullRequestId: pullRequest.id,
      headers: {
        authorization: this.graphqlWriteToken,
      },
    });
  }

  public async setAutoMerge(pullRequest: PullRequestInfo, mergeMethod: 'MERGE' | 'SQUASH' | 'REBASE'): Promise<void> {
    const mutation = `
    mutation enableAutoMerge($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
      enablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId, mergeMethod: $mergeMethod }) {
        pullRequest {
          autoMergeRequest {
            enabledAt
          }
        }
      }
    }
    `;

    await graphql(mutation, {
      pullRequestId: pullRequest.id,
      mergeMethod,
      headers: {
        authorization: this.graphqlWriteToken,
      },
    });
  }

  protected async doGetPullRequestsToReview(
    queryString: string,
    cursor?: string,
    previousMilestones?: PullRequestSearchEdge[],
  ): Promise<PullRequestSearchEdge[]> {
    const query = `
    query getPullRequestsToReview($queryString: String!, $cursorAfter: String) {
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
              id
              url
              mergedAt
              title
              number
              body
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
              statusCheckRollup {
                state
              }
              commits (last:1) {
                nodes {
                  commit {
                    committedDate
                  }
                }
              }    
              author {
                login
              }     
              reviewDecision
              autoMergeRequest {
                enabledAt
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
      return await this.doGetPullRequestsToReview(
        queryString,
        graphQlResponse.search.pageInfo.endCursor,
        allGraphQlResponse,
      );
    }

    return allGraphQlResponse;
  }
}
