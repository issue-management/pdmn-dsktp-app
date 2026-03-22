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
import type { EmitterWebhookEvent } from '@octokit/webhooks';

import type { PullRequestOpenedListener } from '/@/api/pull-request-opened-listener';
import type { PullRequestEditedListener } from '/@/api/pull-request-edited-listener';
import { DependencyChangeAnalyzer } from '/@/helpers/dependency-change-analyzer';
import { DependencyDomainsResolver } from '/@/helpers/dependency-domains-resolver';
import { DomainsHelper, type DomainEntry } from '/@/helpers/domains-helper';
import { PullRequestFilesHelper } from '/@/helpers/pull-request-files-helper';
import { PullRequestInfoLinkedIssuesExtractor } from '/@/info/pull-request-info-linked-issues-extractor';
import { IssuesHelper } from '/@/helpers/issue-helper';
import { PullRequestsHelper } from '/@/helpers/pull-requests-helper';
import { AddLabelHelper } from '/@/helpers/add-label-helper';
import { RepositoriesHelper } from '/@/helpers/repositories-helper';
import { IssueInfo } from '/@/info/issue-info';
import { DomainReviewCheckRunLogic } from '/@/logic/domain-review-check-run-logic';

@injectable()
export class AssignReviewersOnPullRequestLogic implements PullRequestOpenedListener, PullRequestEditedListener {
  @inject(DependencyChangeAnalyzer)
  private dependencyChangeAnalyzer: DependencyChangeAnalyzer;

  @inject(DependencyDomainsResolver)
  private dependencyDomainsResolver: DependencyDomainsResolver;

  @inject(DomainsHelper)
  private domainsHelper: DomainsHelper;

  @inject(PullRequestInfoLinkedIssuesExtractor)
  private linkedIssuesExtractor: PullRequestInfoLinkedIssuesExtractor;

  @inject(IssuesHelper)
  private issuesHelper: IssuesHelper;

  @inject(PullRequestsHelper)
  private pullRequestsHelper: PullRequestsHelper;

  @inject(PullRequestFilesHelper)
  private pullRequestFilesHelper: PullRequestFilesHelper;

  @inject(AddLabelHelper)
  private addLabelHelper: AddLabelHelper;

  @inject(RepositoriesHelper)
  private repositoriesHelper: RepositoriesHelper;

  @inject(DomainReviewCheckRunLogic)
  private domainReviewCheckRunLogic: DomainReviewCheckRunLogic;

  async execute(
    event: EmitterWebhookEvent<'pull_request.opened'> | EmitterWebhookEvent<'pull_request.edited'>,
  ): Promise<void> {
    const pr = event.payload.pull_request;
    const owner = event.payload.repository.owner.login;
    const repo = event.payload.repository.name;
    const prNumber = pr.number;
    const prAuthor = pr.user.login;
    const body = pr.body ?? '';

    console.log(`AssignReviewers: Processing PR #${prNumber} in ${owner}/${repo}`);

    const matchedDomains: DomainEntry[] = [];

    // 1. Repository-based matching: check if the PR's repository maps to a domain
    const repoDomains = this.domainsHelper.getDomainsByRepository(owner, repo);
    if (repoDomains.length > 0) {
      console.log(
        `AssignReviewers: Found ${repoDomains.length} domain(s) by repository: ${repoDomains.map(d => d.domain).join(', ')}`,
      );
      matchedDomains.push(...repoDomains);
    }

    // 2. Issue label-based matching: extract referenced issues from PR body and check their labels
    // Issue extraction for linked issues from the PR body
    const issueDomains = await this.extractIssueDomains(prAuthor, body, owner, repo);
    matchedDomains.push(...issueDomains);

    // 3. Dependency-change-based matching
    const depDomains = await this.detectDependencyDomains(owner, repo, prNumber, pr.base.sha, pr.head.sha);
    matchedDomains.push(...depDomains);

    // Deduplicate domains
    const uniqueDomains = this.deduplicateDomains(matchedDomains);

    if (uniqueDomains.length === 0) {
      console.log('AssignReviewers: No matching domains found, skipping reviewer assignment');
      return;
    }

    console.log(`AssignReviewers: Matched domains: ${uniqueDomains.map(d => d.domain).join(', ')}`);

    // 4. Resolve reviewers from matched domains
    const reviewers = this.domainsHelper.getReviewersForDomains(uniqueDomains);

    // Exclude the PR author from reviewers
    const filteredReviewers = reviewers.filter(r => r !== prAuthor);

    if (filteredReviewers.length > 0) {
      console.log(`AssignReviewers: Requesting reviews from: ${filteredReviewers.join(', ')}`);
      try {
        await this.pullRequestsHelper.requestReviewers(owner, repo, prNumber, filteredReviewers);
      } catch (error: unknown) {
        console.error(`AssignReviewers: Error requesting reviewers for PR #${prNumber} in ${owner}/${repo}:`, error);
      }
    } else {
      console.log('AssignReviewers: No reviewers to assign (all were excluded as PR author)');
    }

    // 5. Add domain labels to the PR
    const domainLabels = this.domainsHelper.getDomainLabels(uniqueDomains);
    const prAsIssue = new IssueInfo()
      .withOwner(owner)
      .withRepo(repo)
      .withNumber(prNumber)
      .withLabels(pr.labels?.map(l => l.name) ?? []);

    console.log(`AssignReviewers: Adding domain labels: ${domainLabels.join(', ')}`);
    await this.addLabelHelper.addLabel(domainLabels, prAsIssue);

    // 6. Create/update domain review check run (chained after labels are set)
    const headSha = pr.head.sha;
    await this.domainReviewCheckRunLogic.updateCheckRun(owner, repo, prNumber, headSha, uniqueDomains);
  }

  private async detectDependencyDomains(
    owner: string,
    repo: string,
    prNumber: number,
    baseSha: string,
    headSha: string,
  ): Promise<DomainEntry[]> {
    try {
      const files = await this.pullRequestFilesHelper.listFiles(owner, repo, prNumber);
      if (!this.pullRequestFilesHelper.isOnlyDependencyFiles(files)) {
        return [];
      }

      const packageJsonPaths = this.pullRequestFilesHelper.getChangedPackageJsonPaths(files);
      if (packageJsonPaths.length === 0) {
        return [];
      }

      const analysis = await this.dependencyChangeAnalyzer.analyze(owner, repo, baseSha, headSha, packageJsonPaths);
      if (!analysis.isDependencyOnlyPR || analysis.changes.length === 0) {
        return [];
      }

      const depDomains = this.dependencyDomainsResolver.resolve(analysis);
      console.log(
        `AssignReviewers: Found ${depDomains.length} dependency domain(s): ${depDomains.map(d => d.domain).join(', ')}`,
      );
      return depDomains;
    } catch (error: unknown) {
      console.error(`AssignReviewers: Error during dependency analysis for PR #${prNumber}:`, error);
      return [];
    }
  }

  private isKnownRepository(issueLink: string): boolean {
    // Parse the issue link: https://api.github.com/repos/{owner}/{repo}/issues/{number}
    const match = /\/repos\/([^/]+)\/([^/]+)\/issues\/\d+/.exec(issueLink);
    if (!match) return false;

    const issueOwner = match[1];
    const issueRepo = match[2];
    const fullName = `${issueOwner}/${issueRepo}`;

    // Check if the org is in our watched organizations
    const orgs = this.repositoriesHelper.getOrganizationsToWatch();
    if (orgs.includes(issueOwner)) return true;

    // Check if the specific repo is in our watched repositories
    const repos = this.repositoriesHelper.getRepositoriesToWatch();
    if (repos.includes(fullName)) return true;

    return false;
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
      console.log(`AssignReviewers: Skipping issue extraction for bot PR author: ${prAuthor}`);
      return [];
    }

    const issueLinks = this.linkedIssuesExtractor.extractFromBody(body, owner, repo);
    console.log(`AssignReviewers: Found ${issueLinks.length} issue reference(s) in PR body`);

    const domains: DomainEntry[] = [];
    for (const issueLink of issueLinks) {
      // Only fetch issues from known orgs/repos
      if (!this.isKnownRepository(issueLink)) {
        console.log(`AssignReviewers: Skipping unknown repository issue: ${issueLink}`);
        continue;
      }

      const issueInfo = await this.issuesHelper.getIssue(issueLink);
      if (!issueInfo) {
        console.log(`AssignReviewers: Could not fetch issue: ${issueLink}`);
        continue;
      }

      console.log(
        `AssignReviewers: Issue #${issueInfo.number} in ${issueInfo.owner}/${issueInfo.repo} has labels: ${issueInfo.labels.join(', ')}`,
      );

      const labelDomains = this.domainsHelper.getDomainsByLabels(issueInfo.labels);
      if (labelDomains.length > 0) {
        console.log(
          `AssignReviewers: Found ${labelDomains.length} domain(s) from issue labels: ${labelDomains.map(d => d.domain).join(', ')}`,
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
