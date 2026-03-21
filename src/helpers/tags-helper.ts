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

import { graphql } from '@octokit/graphql';

export interface TagDefinition {
  committedDate: string;
  name: string;
}

interface TagRefEdge {
  node: {
    name: string;
    repository: {
      nameWithOwner: string;
    };
    target: {
      oid: string;
      commitUrl: string;
      committedDate: string;
    };
  };
}

interface TagSearchNode {
  refs: {
    edges: TagRefEdge[];
  };
}

interface GraphQLTagSearchResponse {
  search: {
    pageInfo: {
      endCursor: string;
      hasNextPage: boolean;
    };
    nodes: TagSearchNode[];
  };
}

@injectable()
export class TagsHelper {
  @inject('string')
  @named('GRAPHQL_READ_TOKEN')
  private graphqlReadToken: string;

  public async getLatestTags(): Promise<Map<string, TagDefinition[]>> {
    const latestTagSearch = await this.doGetLatestTags('repo:podman-desktop/podman-desktop');

    // Received array of edges looking like:
    // [
    // {
    //     "refs": {
    //       "edges": [
    //         {
    //           "node": {
    //             "name": "7.17.0",
    //             "repository": {
    //               "nameWithOwner": "eclipse/che"
    //             },
    //             "target": {
    //               "oid": "37b2ab9eac6bcad6e5da29f8dbd94f91882d28f5",
    //               "commitUrl": "https://github.com/eclipse/che/commit/37b2ab9eac6bcad6e5da29f8dbd94f91882d28f5",
    //               "committedDate": "2020-08-05T13:39:46Z"
    //             }
    //           }
    //         },

    const mapping: Map<string, TagDefinition[]> = new Map();

    latestTagSearch.forEach((item: TagSearchNode) => {
      item.refs.edges.forEach((subitem: TagRefEdge) => {
        const name = subitem.node.name;
        const committedDate = subitem.node.target.committedDate;
        const nameWithOwner = subitem.node.repository.nameWithOwner;
        let tagDefinitions = mapping.get(nameWithOwner);
        tagDefinitions ??= [];
        tagDefinitions.push({ name, committedDate });
        mapping.set(nameWithOwner, tagDefinitions);
      });
    });

    return mapping;
  }

  protected async doGetLatestTags(
    queryString: string,
    cursor?: string,
    previousMilestones?: TagSearchNode[],
  ): Promise<TagSearchNode[]> {
    const query = `
    query getTags($queryString: String!, $cursorAfter: String) {
        rateLimit {
          cost
          remaining
          resetAt
        }
        search(query: $queryString, type: REPOSITORY, first: 50, after: $cursorAfter) {
          pageInfo {
            ... on PageInfo {
              endCursor
              hasNextPage
            }
          }
          nodes {
            ... on Repository {
              refs(refPrefix: "refs/tags/", first: 5, orderBy: {field: TAG_COMMIT_DATE, direction: DESC}) {
                edges {
                  node {
                    name
                    repository {
                      nameWithOwner
                    }
                    target {
                      oid
                      commitUrl
                      ... on Commit {
                        committedDate
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const graphQlResponse = await graphql<GraphQLTagSearchResponse>(query, {
      queryString: queryString,
      cursorAfter: cursor,
      headers: {
        authorization: this.graphqlReadToken,
      },
    });

    let allGraphQlResponse;
    if (previousMilestones) {
      allGraphQlResponse = previousMilestones.concat(graphQlResponse.search.nodes);
    } else {
      allGraphQlResponse = graphQlResponse.search.nodes;
    }

    // Need to loop again
    if (graphQlResponse.search.pageInfo.hasNextPage) {
      // Needs to redo the search starting from the last search
      return await this.doGetLatestTags(queryString, graphQlResponse.search.pageInfo.endCursor, allGraphQlResponse);
    }

    return allGraphQlResponse;
  }
}
