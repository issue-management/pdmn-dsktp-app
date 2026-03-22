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

import { inject, injectable } from 'inversify';

import type { DomainEntry } from '/@/data/domain-entry-schema';
import type { FolderDomainsEntry } from '/@/data/folder-domains-schema';
import { folderDomainsData } from '/@/data/folder-domains-data';
import { DomainsHelper } from '/@/helpers/domains-helper';
import type { PullRequestFile } from '/@/helpers/pull-request-files-helper';

@injectable()
export class FolderDomainsHelper {
  private folderDomains: FolderDomainsEntry[] = folderDomainsData;

  @inject(DomainsHelper)
  private domainsHelper: DomainsHelper;

  getDomainsByFiles(owner: string, repo: string, files: PullRequestFile[]): DomainEntry[] {
    const repoUrl = `https://github.com/${owner}/${repo}`;
    const entry = this.folderDomains.find(e => e.repository === repoUrl);
    if (!entry) {
      return [];
    }

    const matchedDomainNames = this.collectDomainNames(files, entry);
    return this.resolveDomainEntries(matchedDomainNames);
  }

  private collectDomainNames(files: PullRequestFile[], entry: FolderDomainsEntry): Set<string> {
    const matchedDomainNames = new Set<string>();
    let hasUnmatchedFile = false;

    for (const file of files) {
      const matched = this.matchFile(file.filename, entry);
      if (matched.length > 0) {
        for (const domainName of matched) {
          matchedDomainNames.add(domainName);
        }
      } else {
        hasUnmatchedFile = true;
      }
    }

    // Add default domain for unmatched files
    if (hasUnmatchedFile && entry.defaultDomain) {
      matchedDomainNames.add(entry.defaultDomain);
    }

    return matchedDomainNames;
  }

  private resolveDomainEntries(domainNames: Set<string>): DomainEntry[] {
    const result: DomainEntry[] = [];
    const seen = new Set<string>();

    for (const domainName of domainNames) {
      const entries = this.lookupDomainEntries(domainName);
      for (const d of entries) {
        if (!seen.has(d.domain)) {
          seen.add(d.domain);
          result.push(d);
        }
      }
    }

    return result;
  }

  private lookupDomainEntries(domainName: string): DomainEntry[] {
    // Look up by exact name first (handles subgroup names like "Docs/pm")
    const byName = this.domainsHelper.getDomainsByName(domainName);
    if (byName.length > 0) {
      return byName;
    }
    // Try parent domain lookup (e.g. "UI components" matches "UI components/ux" + "UI components/engineering")
    return this.domainsHelper.getDomainsByParentName(domainName);
  }

  private matchFile(filename: string, entry: FolderDomainsEntry): string[] {
    const matched: string[] = [];
    for (const mapping of entry.mappings) {
      if (this.fileMatchesPattern(filename, mapping.pattern)) {
        matched.push(mapping.domain);
      }
    }
    return matched;
  }

  private fileMatchesPattern(filename: string, pattern: string): boolean {
    // Strip trailing /** or /* for prefix matching
    let prefix = pattern;
    if (prefix.endsWith('/**')) {
      prefix = prefix.slice(0, -3);
      return filename.startsWith(`${prefix}/`);
    }
    if (prefix.endsWith('/*')) {
      prefix = prefix.slice(0, -2);
      return filename.startsWith(`${prefix}/`);
    }
    // Patterns ending with * (e.g. "packages/main/src/plugin/container*")
    if (prefix.endsWith('*')) {
      prefix = prefix.slice(0, -1);
      return filename.startsWith(prefix);
    }
    // Exact match
    return filename === pattern;
  }
}
