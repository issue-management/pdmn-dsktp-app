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

interface GraphQLSearchCountResponse {
  search: {
    issueCount: number;
  };
}

@injectable()
export class MergedPrCounterHelper {
  @inject('string')
  @named('GRAPHQL_READ_TOKEN')
  private graphqlReadToken: string;

  public async countMergedPrsByAuthor(author: string, owner: string, repo: string): Promise<number> {
    const queryString = `is:pr is:merged author:${author} repo:${owner}/${repo}`;

    const query = `
    query countMergedPRs($queryString: String!) {
      search(query: $queryString, type: ISSUE, first: 0) {
        issueCount
      }
    }
    `;

    const response = await graphql<GraphQLSearchCountResponse>(query, {
      queryString,
      headers: {
        authorization: this.graphqlReadToken,
      },
    });

    return response.search.issueCount;
  }
}
