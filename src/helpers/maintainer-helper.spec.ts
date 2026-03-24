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

import 'reflect-metadata';

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Container } from 'inversify';

import { MaintainerHelper } from '/@/helpers/maintainer-helper';

vi.mock(import('/@/data/users-data'), () => ({
  usersData: {
    Alice: 'alice-gh',
    Bob: 'bob-gh',
  },
}));

describe(MaintainerHelper, () => {
  let container: Container;
  let mockCheckMembershipForUser: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();

    mockCheckMembershipForUser = vi.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({});

    container = new Container();
    container.bind(MaintainerHelper).toSelf().inSingletonScope();
    container
      .bind('Octokit')
      .toConstantValue({
        rest: {
          orgs: {
            checkMembershipForUser: mockCheckMembershipForUser,
          },
        },
      })
      .whenNamed('READ_TOKEN');
  });

  test('returns true for a username present in usersData', () => {
    expect.assertions(1);

    const helper = container.get(MaintainerHelper);

    expect(helper.isMaintainer('alice-gh')).toBe(true);
  });

  test('returns false for a username not present in usersData', () => {
    expect.assertions(1);

    const helper = container.get(MaintainerHelper);

    expect(helper.isMaintainer('unknown-user')).toBe(false);
  });

  test('returns true without api call when username is in usersData', async () => {
    expect.assertions(2);

    const helper = container.get(MaintainerHelper);
    const result = await helper.isMaintainerOrOrgMember('alice-gh', 'test-org');

    expect(result).toBe(true);
    expect(mockCheckMembershipForUser).not.toHaveBeenCalled();
  });

  test('checks org membership when username is not in usersData', async () => {
    expect.assertions(2);

    const helper = container.get(MaintainerHelper);
    const result = await helper.isMaintainerOrOrgMember('external-user', 'test-org');

    expect(result).toBe(true);
    expect(mockCheckMembershipForUser).toHaveBeenCalledExactlyOnceWith({
      org: 'test-org',
      username: 'external-user',
    });
  });

  test('returns false when username is not in usersData and not an org member', async () => {
    expect.assertions(1);

    mockCheckMembershipForUser.mockRejectedValue(new Error('Not found'));

    const helper = container.get(MaintainerHelper);
    const result = await helper.isMaintainerOrOrgMember('external-user', 'test-org');

    expect(result).toBe(false);
  });
});
