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

import { DependencyChangeAnalyzer } from '/@/helpers/dependency-change-analyzer';
import { DependencyDomainsResolver } from '/@/helpers/dependency-domains-resolver';
import { DomainsHelper, type DomainEntry } from '/@/helpers/domains-helper';
import { FolderDomainsHelper } from '/@/helpers/folder-domains-helper';
import { IssuesHelper } from '/@/helpers/issue-helper';
import { PullRequestFilesHelper, type PullRequestFile } from '/@/helpers/pull-request-files-helper';
import { RepositoriesHelper } from '/@/helpers/repositories-helper';
import { PullRequestInfoLinkedIssuesExtractor } from '/@/info/pull-request-info-linked-issues-extractor';

@injectable()
export class DetectDomainsHelper {
  @inject(DependencyChangeAnalyzer)
  private dependencyChangeAnalyzer: DependencyChangeAnalyzer;

  @inject(DependencyDomainsResolver)
  private dependencyDomainsResolver: DependencyDomainsResolver;

  @inject(DomainsHelper)
  private domainsHelper: DomainsHelper;

  @inject(FolderDomainsHelper)
  private folderDomainsHelper: FolderDomainsHelper;

  @inject(PullRequestInfoLinkedIssuesExtractor)
  private linkedIssuesExtractor: PullRequestInfoLinkedIssuesExtractor;

  @inject(IssuesHelper)
  private issuesHelper: IssuesHelper;

  @inject(PullRequestFilesHelper)
  private pullRequestFilesHelper: PullRequestFilesHelper;

  @inject(RepositoriesHelper)
  private repositoriesHelper: RepositoriesHelper;

  async detectDomains(
    owner: string,
    repo: string,
    prNumber: number,
    prAuthor: string,
    body: string,
    baseSha: string,
    headSha: string,
  ): Promise<{ domains: DomainEntry[]; files: PullRequestFile[] }> {
    const matchedDomains: DomainEntry[] = [];

    // 1. Repository-based matching: check if the PR's repository maps to a domain
    const repoDomains = this.domainsHelper.getDomainsByRepository(owner, repo);
    if (repoDomains.length > 0) {
      console.log(
        `DetectDomains: Found ${repoDomains.length} domain(s) by repository: ${repoDomains.map(d => d.domain).join(', ')}`,
      );
      matchedDomains.push(...repoDomains);
    }

    // 2. Folder-based matching: detect domains from changed file paths
    const files = await this.pullRequestFilesHelper.listFiles(owner, repo, prNumber);
    const folderDomains = this.folderDomainsHelper.getDomainsByFiles(owner, repo, files);
    if (folderDomains.length > 0) {
      console.log(
        `DetectDomains: Found ${folderDomains.length} domain(s) by folder detection: ${folderDomains.map(d => d.domain).join(', ')}`,
      );
      matchedDomains.push(...folderDomains);
    }

    // 3. Issue label-based matching: extract referenced issues from PR body and check their labels
    const issueDomains = await this.extractIssueDomains(prAuthor, body, owner, repo);
    matchedDomains.push(...issueDomains);

    // 4. Dependency-change-based matching (reuses files from step 2)
    const depResult = await this.detectDependencyDomains(owner, repo, prNumber, baseSha, headSha, files);
    matchedDomains.push(...depResult.domains);

    // Deduplicate domains
    let uniqueDomains = this.deduplicateDomains(matchedDomains);

    // For dependency-only PRs, drop folder-based domains
    // For minor-only dependency PRs, also drop repo-based domains to allow auto-merge
    if (depResult.domains.length > 0 && this.pullRequestFilesHelper.isOnlyDependencyFiles(files)) {
      const folderDomainNames = new Set(folderDomains.map(d => d.domain));
      const isOnlyMinorUpdates = depResult.domains.every(d => d.domain === 'dependency-update-minor');
      if (isOnlyMinorUpdates) {
        const repoDomainNames = new Set(repoDomains.map(d => d.domain));
        uniqueDomains = uniqueDomains.filter(d => !folderDomainNames.has(d.domain) && !repoDomainNames.has(d.domain));
      } else {
        uniqueDomains = uniqueDomains.filter(d => !folderDomainNames.has(d.domain));
      }
    }

    return { domains: uniqueDomains, files };
  }

  private async detectDependencyDomains(
    owner: string,
    repo: string,
    prNumber: number,
    baseSha: string,
    headSha: string,
    files: PullRequestFile[],
  ): Promise<{ domains: DomainEntry[] }> {
    const empty = { domains: [] };
    try {
      if (!this.pullRequestFilesHelper.isOnlyDependencyFiles(files)) {
        return empty;
      }

      const packageJsonPaths = this.pullRequestFilesHelper.getChangedPackageJsonPaths(files);
      if (packageJsonPaths.length === 0) {
        return empty;
      }

      const analysis = await this.dependencyChangeAnalyzer.analyze(owner, repo, baseSha, headSha, packageJsonPaths);
      if (!analysis.isDependencyOnlyPR || analysis.changes.length === 0) {
        return empty;
      }

      const result = this.dependencyDomainsResolver.resolve(analysis);
      console.log(`DetectDomains: Found dependency domains: ${result.domains.map(d => d.domain).join(', ')}`);
      return result;
    } catch (error: unknown) {
      console.error(`DetectDomains: Error during dependency analysis for PR #${prNumber}:`, error);
      return empty;
    }
  }

  private isKnownRepositoryLink(issueLink: string): boolean {
    const match = /\/repos\/([^/]+)\/([^/]+)\/issues\/\d+/.exec(issueLink);
    if (!match) return false;

    return this.repositoriesHelper.isKnownRepository(match[1], match[2]);
  }

  private async extractIssueDomains(
    prAuthor: string,
    body: string,
    owner: string,
    repo: string,
  ): Promise<DomainEntry[]> {
    // Skip bot PRs (e.g. Dependabot) as their bodies contain
    // Issue references from external repositories that are not relevant
    if (prAuthor.includes('[bot]')) {
      console.log(`DetectDomains: Skipping issue extraction for bot PR author: ${prAuthor}`);
      return [];
    }

    const issueLinks = this.linkedIssuesExtractor.extractFromBody(body, owner, repo);
    console.log(`DetectDomains: Found ${issueLinks.length} issue reference(s) in PR body`);

    const domains: DomainEntry[] = [];
    for (const issueLink of issueLinks) {
      // Only fetch issues from known orgs/repos
      if (!this.isKnownRepositoryLink(issueLink)) {
        console.log(`DetectDomains: Skipping unknown repository issue: ${issueLink}`);
        continue;
      }

      const issueInfo = await this.issuesHelper.getIssue(issueLink);
      if (!issueInfo) {
        console.log(`DetectDomains: Could not fetch issue: ${issueLink}`);
        continue;
      }

      console.log(
        `DetectDomains: Issue #${issueInfo.number} in ${issueInfo.owner}/${issueInfo.repo} has labels: ${issueInfo.labels.join(', ')}`,
      );

      const labelDomains = this.domainsHelper.getDomainsByLabels(issueInfo.labels);
      if (labelDomains.length > 0) {
        console.log(
          `DetectDomains: Found ${labelDomains.length} domain(s) from issue labels: ${labelDomains.map(d => d.domain).join(', ')}`,
        );
        domains.push(...labelDomains);
      }
    }
    return domains;
  }

  private deduplicateDomains(domains: DomainEntry[]): DomainEntry[] {
    const seen = new Set<string>();
    return domains.filter(d => {
      if (seen.has(d.domain)) return false;
      seen.add(d.domain);
      return true;
    });
  }
}
