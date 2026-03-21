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

import type { Mock } from 'vitest';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import 'reflect-metadata';

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { MilestoneDefinition } from './milestone-helper';
import { MilestoneHelper } from './milestone-helper';

import { Container } from 'inversify';
import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';
import { graphql } from '@octokit/graphql';

vi.mock(import('@octokit/graphql'));

describe('test Helper MilestoneHelper', () => {
  let container: Container;
  let octokit: {
    rest: {
      issues: {
        createMilestone: Mock<(params: unknown) => unknown>;
        updateMilestone: Mock<(params: unknown) => unknown>;
      };
    };
  };

  beforeEach(() => {
    container = new Container();
    container.bind(MilestoneHelper).toSelf().inSingletonScope();
    octokit = {
      rest: {
        issues: {
          createMilestone: vi.fn<(params: unknown) => unknown>(),
          updateMilestone: vi.fn<(params: unknown) => unknown>(),
        },
      },
    };

    container.bind('Octokit').toConstantValue(octokit);
    container.bind('string').toConstantValue('fooToken').whenNamed('GRAPHQL_READ_TOKEN');
  });

  test('call correct API for create milestone - calls createMilestone', async () => {
    expect.assertions(1);

    const addMilestoneHelper = container.get(MilestoneHelper);

    const milestoneToAdd = 'milestone-to-add';
    const milestoneDescription = 'my-description';
    const milestoneNumber = 2503;
    const milestoneDueOn = '2020-10-07T00:00:00Z';
    const milestoneState = 'open';

    const repoOwner = 'eclipse';
    const repoName = 'che';

    const milestoneDetails: MilestoneDefinition = {
      title: milestoneToAdd,
      number: milestoneNumber,
      description: milestoneDescription,
      dueOn: milestoneDueOn,
      state: milestoneState,
    };
    await addMilestoneHelper.createMilestone(repoOwner, repoName, milestoneDetails);

    expect(octokit.rest.issues.createMilestone).toHaveBeenCalledWith(expect.any(Object));
  });

  test('call correct API for create milestone - passes correct parameters', async () => {
    expect.assertions(5);

    const addMilestoneHelper = container.get(MilestoneHelper);

    const milestoneToAdd = 'milestone-to-add';
    const milestoneDescription = 'my-description';
    const milestoneNumber = 2503;
    const milestoneDueOn = '2020-10-07T00:00:00Z';
    const milestoneState = 'open';

    const repoOwner = 'eclipse';
    const repoName = 'che';

    const milestoneDetails: MilestoneDefinition = {
      title: milestoneToAdd,
      number: milestoneNumber,
      description: milestoneDescription,
      dueOn: milestoneDueOn,
      state: milestoneState,
    };
    await addMilestoneHelper.createMilestone(repoOwner, repoName, milestoneDetails);

    const createMilestoneParams = octokit.rest.issues.createMilestone.mock
      .calls[0]![0] as unknown as RestEndpointMethodTypes['issues']['createMilestone']['parameters'];

    expect(createMilestoneParams.title).toBe(milestoneToAdd);
    expect(createMilestoneParams.due_on).toBe(milestoneDueOn);
    expect(createMilestoneParams.description).toBe(milestoneDescription);
    expect(createMilestoneParams.state).toBe(milestoneState);
    expect(createMilestoneParams.repo).toBe(repoName);
  });

  test('call correct API for create milestone with null - calls createMilestone', async () => {
    expect.assertions(1);

    const addMilestoneHelper = container.get(MilestoneHelper);

    const milestoneToAdd = 'milestone-to-add';
    const milestoneNumber = 2503;
    const milestoneState = 'open';

    const repoOwner = 'eclipse';
    const repoName = 'che';

    const milestoneDetails: MilestoneDefinition = {
      title: milestoneToAdd,
      number: milestoneNumber,
      state: milestoneState,
    };
    await addMilestoneHelper.createMilestone(repoOwner, repoName, milestoneDetails);

    expect(octokit.rest.issues.createMilestone).toHaveBeenCalledWith(expect.any(Object));
  });

  test('call correct API for create milestone with null - handles undefined fields', async () => {
    expect.assertions(5);

    const addMilestoneHelper = container.get(MilestoneHelper);

    const milestoneToAdd = 'milestone-to-add';
    const milestoneNumber = 2503;
    const milestoneState = 'open';

    const repoOwner = 'eclipse';
    const repoName = 'che';

    const milestoneDetails: MilestoneDefinition = {
      title: milestoneToAdd,
      number: milestoneNumber,
      state: milestoneState,
    };
    await addMilestoneHelper.createMilestone(repoOwner, repoName, milestoneDetails);

    const createMilestoneParams = octokit.rest.issues.createMilestone.mock
      .calls[0]![0] as unknown as RestEndpointMethodTypes['issues']['createMilestone']['parameters'];

    expect(createMilestoneParams.title).toBe(milestoneToAdd);
    expect(createMilestoneParams.due_on).toBeUndefined();
    expect(createMilestoneParams.description).toBeUndefined();
    expect(createMilestoneParams.state).toBe(milestoneState);
    expect(createMilestoneParams.repo).toBe(repoName);
  });

  test('call correct API for update milestone - calls updateMilestone', async () => {
    expect.assertions(1);

    const addMilestoneHelper = container.get(MilestoneHelper);

    const milestoneToAdd = 'milestone-to-update';
    const milestoneDescription = 'my-description';
    const milestoneNumber = 2503;
    const milestoneDueOn = '2020-10-07T00:00:00Z';
    const milestoneState = 'open';

    const repoOwner = 'eclipse';
    const repoName = 'che';

    const milestoneDetails: MilestoneDefinition = {
      title: milestoneToAdd,
      number: milestoneNumber,
      description: milestoneDescription,
      dueOn: milestoneDueOn,
      state: milestoneState,
    };
    await addMilestoneHelper.updateMilestone(repoOwner, repoName, milestoneDetails);

    expect(octokit.rest.issues.updateMilestone).toHaveBeenCalledWith(expect.any(Object));
  });

  test('call correct API for update milestone - passes correct parameters', async () => {
    expect.assertions(5);

    const addMilestoneHelper = container.get(MilestoneHelper);

    const milestoneToAdd = 'milestone-to-update';
    const milestoneDescription = 'my-description';
    const milestoneNumber = 2503;
    const milestoneDueOn = '2020-10-07T00:00:00Z';
    const milestoneState = 'open';

    const repoOwner = 'eclipse';
    const repoName = 'che';

    const milestoneDetails: MilestoneDefinition = {
      title: milestoneToAdd,
      number: milestoneNumber,
      description: milestoneDescription,
      dueOn: milestoneDueOn,
      state: milestoneState,
    };
    await addMilestoneHelper.updateMilestone(repoOwner, repoName, milestoneDetails);

    const createMilestoneParams = octokit.rest.issues.updateMilestone.mock
      .calls[0]![0] as unknown as RestEndpointMethodTypes['issues']['createMilestone']['parameters'];

    expect(createMilestoneParams.title).toBe(milestoneToAdd);
    expect(createMilestoneParams.milestone_number).toBe(milestoneNumber);
    expect(createMilestoneParams.due_on).toBe(milestoneDueOn);
    expect(createMilestoneParams.description).toBe(milestoneDescription);
    expect(createMilestoneParams.state).toBe(milestoneState);
  });

  test('call correct API for update milestone with null - calls updateMilestone', async () => {
    expect.assertions(1);

    const addMilestoneHelper = container.get(MilestoneHelper);

    const milestoneToAdd = 'milestone-to-update';
    const milestoneNumber = 2503;
    const milestoneState = 'open';

    const repoOwner = 'eclipse';
    const repoName = 'che';

    const milestoneDetails: MilestoneDefinition = {
      title: milestoneToAdd,
      number: milestoneNumber,
      state: milestoneState,
    };
    await addMilestoneHelper.updateMilestone(repoOwner, repoName, milestoneDetails);

    expect(octokit.rest.issues.updateMilestone).toHaveBeenCalledWith(expect.any(Object));
  });

  test('call correct API for update milestone with null - handles undefined fields', async () => {
    expect.assertions(5);

    const addMilestoneHelper = container.get(MilestoneHelper);

    const milestoneToAdd = 'milestone-to-update';
    const milestoneNumber = 2503;
    const milestoneState = 'open';

    const repoOwner = 'eclipse';
    const repoName = 'che';

    const milestoneDetails: MilestoneDefinition = {
      title: milestoneToAdd,
      number: milestoneNumber,
      state: milestoneState,
    };
    await addMilestoneHelper.updateMilestone(repoOwner, repoName, milestoneDetails);

    const createMilestoneParams = octokit.rest.issues.updateMilestone.mock
      .calls[0]![0] as unknown as RestEndpointMethodTypes['issues']['createMilestone']['parameters'];

    expect(createMilestoneParams.title).toBe(milestoneToAdd);
    expect(createMilestoneParams.milestone_number).toBe(milestoneNumber);
    expect(createMilestoneParams.due_on).toBeUndefined();
    expect(createMilestoneParams.description).toBeUndefined();
    expect(createMilestoneParams.state).toBe(milestoneState);
  });

  test('search milestone - returns correct repository count and milestone', async () => {
    expect.assertions(3);

    const milestoneHelper = container.get(MilestoneHelper);
    const json = await fs.readFile(
      path.join(__dirname, '..', '..', 'tests', '_data', 'helper', 'search-milestone.json'),
      'utf8',
    );
    const parsedJSON = JSON.parse(json);
    vi.mocked(graphql).mockResolvedValueOnce(parsedJSON);

    const anotherSON = JSON.parse(json);
    anotherSON.search.pageInfo.hasNextPage = false;
    vi.mocked(graphql).mockResolvedValueOnce(anotherSON);
    const map = await milestoneHelper.searchMilestones(['eclipse/che']);

    // Should have 3 repositories with milestones
    expect(map.size).toBe(3);

    const cheMilestones = map.get('eclipse/che');

    expect(cheMilestones).toBeDefined();

    const milestone760 = cheMilestones!.get('7.6.0');

    expect(milestone760).toBeDefined();
  });

  test('search milestone - milestone properties are correct', async () => {
    expect.assertions(5);

    const milestoneHelper = container.get(MilestoneHelper);
    const json = await fs.readFile(
      path.join(__dirname, '..', '..', 'tests', '_data', 'helper', 'search-milestone.json'),
      'utf8',
    );
    const parsedJSON = JSON.parse(json);
    vi.mocked(graphql).mockResolvedValueOnce(parsedJSON);

    const anotherSON = JSON.parse(json);
    anotherSON.search.pageInfo.hasNextPage = false;
    vi.mocked(graphql).mockResolvedValueOnce(anotherSON);
    const map = await milestoneHelper.searchMilestones(['eclipse/che']);

    const cheMilestones = map.get('eclipse/che');
    const milestone760 = cheMilestones!.get('7.6.0');

    expect(milestone760!.description).toBe('');
    expect(milestone760!.number).toBe(107);
    expect(milestone760!.title).toBe('7.6.0');
    expect(milestone760!.state).toBe('closed');
    expect(milestone760!.dueOn).toBe('2019-12-18T00:00:00Z');
  });

  test('search milestone with additional entries - returns correct count and milestone', async () => {
    expect.assertions(3);

    const milestoneHelper = container.get(MilestoneHelper);
    const json = await fs.readFile(
      path.join(__dirname, '..', '..', 'tests', '_data', 'helper', 'search-milestone-additional-entries.json'),
      'utf8',
    );
    const parsedJSON = JSON.parse(json);
    vi.mocked(graphql).mockResolvedValueOnce(parsedJSON);

    const anotherSON = JSON.parse(json);
    anotherSON.search.edges[0].node.milestones.pageInfo.hasNextPage = false;
    vi.mocked(graphql).mockResolvedValueOnce(anotherSON);
    const map = await milestoneHelper.searchMilestones(['eclipse/che']);

    // Should have 1 repositories with milestones
    expect(map.size).toBe(1);

    const cheMilestones = map.get('eclipse/che');

    expect(cheMilestones).toBeDefined();

    const milestone760 = cheMilestones!.get('7.6.0');

    expect(milestone760).toBeDefined();
  });

  test('search milestone with additional entries - milestone properties are correct', async () => {
    expect.assertions(5);

    const milestoneHelper = container.get(MilestoneHelper);
    const json = await fs.readFile(
      path.join(__dirname, '..', '..', 'tests', '_data', 'helper', 'search-milestone-additional-entries.json'),
      'utf8',
    );
    const parsedJSON = JSON.parse(json);
    vi.mocked(graphql).mockResolvedValueOnce(parsedJSON);

    const anotherSON = JSON.parse(json);
    anotherSON.search.edges[0].node.milestones.pageInfo.hasNextPage = false;
    vi.mocked(graphql).mockResolvedValueOnce(anotherSON);
    const map = await milestoneHelper.searchMilestones(['eclipse/che']);

    const cheMilestones = map.get('eclipse/che');
    const milestone760 = cheMilestones!.get('7.6.0');

    expect(milestone760!.description).toBe('');
    expect(milestone760!.number).toBe(107);
    expect(milestone760!.title).toBe('7.6.0');
    expect(milestone760!.state).toBe('closed');
    expect(milestone760!.dueOn).toBe('2019-12-18T00:00:00Z');
  });
});
