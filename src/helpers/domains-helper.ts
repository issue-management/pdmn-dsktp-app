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

import type { DomainEntry } from '/@/data/domain-entry-schema';
import { domainsData } from '/@/data/domains-data';
import { extraDomainsData } from '/@/data/extra-domains-data';
import { usersData } from '/@/data/users-data';

export type { DomainEntry } from '/@/data/domain-entry-schema';

@injectable()
export class DomainsHelper {
  private domains: DomainEntry[] = domainsData;
  private extraDomains: DomainEntry[] = extraDomainsData;
  private allDomains: DomainEntry[] = [...domainsData, ...extraDomainsData];
  private users: Record<string, string> = usersData;

  // Returns the parent domain name (part before `/`) or the full name if no `/`
  getParentDomainName(domain: DomainEntry): string {
    const slashIndex = domain.domain.indexOf('/');
    if (slashIndex === -1) return domain.domain;
    return domain.domain.substring(0, slashIndex);
  }

  getDomainsByRepository(owner: string, repo: string): DomainEntry[] {
    const repoUrl = `https://github.com/${owner}/${repo}`;
    return this.domains.filter(d => d.repository === repoUrl);
  }

  // Returns all domain entries (including subgroups) matching labels.
  // A label like `domain/ui components/inreview` matches parent domain "UI components"
  // And returns all subgroup entries (e.g. "UI components/ux", "UI components/engineering").
  getDomainsByLabels(labels: string[]): DomainEntry[] {
    const matchedDomains: DomainEntry[] = [];
    console.log('Looking for domains matching labels:', labels);
    for (const label of labels) {
      // Match "domain/<name>/inreview" or "domain/<name>/reviewed"
      const domainMatch = /^domain\/([^/]+)\/(inreview|reviewed)$/.exec(label);
      if (domainMatch) {
        const domainName = domainMatch[1];
        const found = this.allDomains.filter(
          d => this.getParentDomainName(d).toLowerCase() === domainName.toLowerCase(),
        );
        matchedDomains.push(...found);
      }

      // Match "area/<name>" labels
      const areaMatch = /^area\/(.+)$/.exec(label);
      if (areaMatch) {
        const areaName = areaMatch[1];
        const found = this.allDomains.filter(d => this.getParentDomainName(d).toLowerCase() === areaName.toLowerCase());
        matchedDomains.push(...found);
      }
    }

    // Deduplicate by full domain name (preserving subgroups)
    const seen = new Set<string>();
    const filtered = matchedDomains.filter(d => {
      if (seen.has(d.domain)) return false;
      seen.add(d.domain);
      return true;
    });
    console.log(`Found ${filtered.length} unique domain(s) matching labels: ${filtered.map(d => d.domain).join(', ')}`);
    return filtered;
  }

  // Look up domain entries by exact domain name (including subgroup entries like "Docs/pm")
  getDomainsByName(domainName: string): DomainEntry[] {
    return this.allDomains.filter(d => d.domain.toLowerCase() === domainName.toLowerCase());
  }

  // Look up all domain entries sharing a parent domain name
  getDomainsByParentName(parentName: string): DomainEntry[] {
    return this.allDomains.filter(d => this.getParentDomainName(d).toLowerCase() === parentName.toLowerCase());
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

  // Returns deduplicated labels using the parent domain name
  getDomainLabels(domains: DomainEntry[]): string[] {
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const d of domains) {
      const parentName = this.getParentDomainName(d).toLowerCase();
      const label = `domain/${parentName}/inreview`;
      if (!seen.has(label)) {
        seen.add(label);
        labels.push(label);
      }
    }
    return labels;
  }
}
