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
import picomatch from 'picomatch';

import type { DomainEntry } from '/@/data/domain-entry-schema';
import type { FolderDomainsEntry } from '/@/data/folder-domains-schema';
import { folderDomainsData } from '/@/data/folder-domains-data';
import { DomainsHelper } from '/@/helpers/domains-helper';
import type { PullRequestFile } from '/@/helpers/pull-request-files-helper';

export interface FileMatchDetail {
  domain: string;
  pattern: string;
  matchType: 'primary' | 'global' | 'default';
}

@injectable()
export class FolderDomainsHelper {
  private folderDomains: FolderDomainsEntry[] = folderDomainsData;

  @inject(DomainsHelper)
  private domainsHelper: DomainsHelper;

  getDomainsByFiles(owner: string, repo: string, files: PullRequestFile[]): DomainEntry[] {
    const entry = this.resolveEntry(owner, repo);
    if (!entry) {
      return [];
    }

    const matchedDomainNames = this.collectDomainNames(files, entry);
    return this.resolveDomainEntries(matchedDomainNames);
  }

  private resolveEntry(owner: string, repo: string): FolderDomainsEntry | undefined {
    const repoUrl = `https://github.com/${owner}/${repo}`;
    const repoEntry = this.folderDomains.find(e => e.repository === repoUrl);
    const wildcardEntry = this.folderDomains.find(e => e.repository === '*');

    if (!repoEntry && !wildcardEntry) {
      return undefined;
    }

    // Wildcard only
    if (!repoEntry && wildcardEntry) {
      return wildcardEntry;
    }

    // Repo only
    if (repoEntry && !wildcardEntry) {
      return repoEntry;
    }

    // Merge: repo-specific mappings first (higher priority), then wildcard mappings appended
    return {
      repository: repoUrl,
      mappings: [...repoEntry!.mappings, ...wildcardEntry!.mappings],
      globalMappings: [...(repoEntry!.globalMappings ?? []), ...(wildcardEntry!.globalMappings ?? [])],
      defaultDomain: repoEntry!.defaultDomain ?? wildcardEntry!.defaultDomain,
    };
  }

  private collectDomainNames(files: PullRequestFile[], entry: FolderDomainsEntry): Set<string> {
    const matchedDomainNames = new Set<string>();
    let hasFullyUnmatchedFile = false;

    for (const file of files) {
      const primaryDomain = this.matchFirstPrimary(file.filename, entry);
      const globalDomains = this.matchAllGlobal(file.filename, entry);

      if (primaryDomain) {
        matchedDomainNames.add(primaryDomain);
      }

      for (const domainName of globalDomains) {
        matchedDomainNames.add(domainName);
      }

      // Default only applies when file has no match at all (neither primary nor global)
      if (!primaryDomain && globalDomains.length === 0) {
        hasFullyUnmatchedFile = true;
      }
    }

    if (hasFullyUnmatchedFile && entry.defaultDomain) {
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

  getFileToDomainMap(owner: string, repo: string, files: PullRequestFile[]): Map<string, string[]> {
    const entry = this.resolveEntry(owner, repo);
    const result = new Map<string, string[]>();
    if (!entry) {
      return result;
    }

    for (const file of files) {
      const domains: string[] = [];

      const primaryDomain = this.matchFirstPrimary(file.filename, entry);
      if (primaryDomain) {
        domains.push(primaryDomain);
      }

      const globalDomains = this.matchAllGlobal(file.filename, entry);
      for (const domainName of globalDomains) {
        if (!domains.includes(domainName)) {
          domains.push(domainName);
        }
      }

      // Default only applies when file has no match at all (neither primary nor global)
      if (domains.length === 0 && entry.defaultDomain) {
        domains.push(entry.defaultDomain);
      }

      result.set(file.filename, domains);
    }

    return result;
  }

  getFileMatchDetails(owner: string, repo: string, files: PullRequestFile[]): Map<string, FileMatchDetail[]> {
    const entry = this.resolveEntry(owner, repo);
    const result = new Map<string, FileMatchDetail[]>();
    if (!entry) {
      return result;
    }

    for (const file of files) {
      const details: FileMatchDetail[] = [];

      const primaryMatch = this.matchFirstPrimaryWithPattern(file.filename, entry);
      if (primaryMatch) {
        details.push({ domain: primaryMatch.domain, pattern: primaryMatch.pattern, matchType: 'primary' });
      }

      const globalMatches = this.matchAllGlobalWithPattern(file.filename, entry);
      for (const match of globalMatches) {
        if (!details.some(d => d.domain === match.domain)) {
          details.push({ domain: match.domain, pattern: match.pattern, matchType: 'global' });
        }
      }

      // Default only applies when file has no match at all (neither primary nor global)
      if (details.length === 0 && entry.defaultDomain) {
        details.push({ domain: entry.defaultDomain, pattern: '*', matchType: 'default' });
      }

      result.set(file.filename, details);
    }

    return result;
  }

  private matchFirstPrimaryWithPattern(
    filename: string,
    entry: FolderDomainsEntry,
  ): { domain: string; pattern: string } | undefined {
    for (const mapping of entry.mappings) {
      if (picomatch.isMatch(filename, mapping.pattern)) {
        return { domain: mapping.domain, pattern: mapping.pattern };
      }
    }
    return undefined;
  }

  private matchAllGlobalWithPattern(
    filename: string,
    entry: FolderDomainsEntry,
  ): { domain: string; pattern: string }[] {
    if (!entry.globalMappings) {
      return [];
    }
    const matched: { domain: string; pattern: string }[] = [];
    for (const mapping of entry.globalMappings) {
      if (picomatch.isMatch(filename, mapping.pattern)) {
        matched.push({ domain: mapping.domain, pattern: mapping.pattern });
      }
    }
    return matched;
  }

  private matchFirstPrimary(filename: string, entry: FolderDomainsEntry): string | undefined {
    for (const mapping of entry.mappings) {
      if (picomatch.isMatch(filename, mapping.pattern)) {
        return mapping.domain;
      }
    }
    return undefined;
  }

  private matchAllGlobal(filename: string, entry: FolderDomainsEntry): string[] {
    if (!entry.globalMappings) {
      return [];
    }
    const matched: string[] = [];
    for (const mapping of entry.globalMappings) {
      if (picomatch.isMatch(filename, mapping.pattern)) {
        matched.push(mapping.domain);
      }
    }
    return matched;
  }
}
