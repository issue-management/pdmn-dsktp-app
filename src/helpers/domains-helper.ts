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

import { injectable } from 'inversify';

import domainsData from '/@domains.json' with { type: 'json' };
import usersData from '/@users.json' with { type: 'json' };

export interface DomainEntry {
  domain: string;
  description: string;
  owners: string[];
  repository?: string;
}

@injectable()
export class DomainsHelper {
  private domains: DomainEntry[] = domainsData as DomainEntry[];
  private users: Record<string, string> = usersData as Record<string, string>;

  getDomainsByRepository(owner: string, repo: string): DomainEntry[] {
    const repoUrl = `https://github.com/${owner}/${repo}`;
    return this.domains.filter(d => d.repository === repoUrl);
  }

  getDomainsByLabels(labels: string[]): DomainEntry[] {
    const matchedDomains: DomainEntry[] = [];

    for (const label of labels) {
      // Match "domain/<name>/inreview" or "domain/<name>/reviewed"
      const domainMatch = /^domain\/([^/]+)\/(inreview|reviewed)$/.exec(label);
      if (domainMatch) {
        const domainName = domainMatch[1];
        const found = this.domains.filter(d => d.domain.toLowerCase() === domainName.toLowerCase());
        matchedDomains.push(...found);
      }

      // Match "area/<name>" labels
      const areaMatch = /^area\/(.+)$/.exec(label);
      if (areaMatch) {
        const areaName = areaMatch[1];
        const found = this.domains.filter(d => d.domain.toLowerCase() === areaName.toLowerCase());
        matchedDomains.push(...found);
      }
    }

    // Deduplicate by domain name
    const seen = new Set<string>();
    return matchedDomains.filter(d => {
      if (seen.has(d.domain)) return false;
      seen.add(d.domain);
      return true;
    });
  }

  resolveGitHubUsernames(owners: string[]): string[] {
    const usernames: string[] = [];
    for (const owner of owners) {
      const username = this.users[owner];
      if (username) {
        usernames.push(username);
      } else {
        // Treat as a direct GitHub username (e.g. from extra-domains.json)
        usernames.push(owner);
      }
    }
    return usernames;
  }

  getReviewersForDomains(domains: DomainEntry[]): string[] {
    const allOwners = new Set<string>();
    for (const domain of domains) {
      for (const owner of domain.owners) {
        allOwners.add(owner);
      }
    }
    return this.resolveGitHubUsernames([...allOwners]);
  }

  getDomainLabels(domains: DomainEntry[]): string[] {
    return domains.map(d => `domain/${d.domain.toLowerCase()}/inreview`);
  }
}
