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

import { CHECK_RUN_NAME, CheckRunHelper } from '/@/helpers/check-run-helper';

describe('checkRunHelper', () => {
  let container: Container;
  let checkRunHelper: CheckRunHelper;
  let mockChecksCreate: ReturnType<typeof vi.fn>;
  let mockChecksUpdate: ReturnType<typeof vi.fn>;
  let mockChecksListForRef: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockChecksCreate = vi.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({});
    mockChecksUpdate = vi.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({});
    mockChecksListForRef = vi.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({
      data: { check_runs: [] },
    });

    container = new Container();
    container.bind(CheckRunHelper).toSelf().inSingletonScope();
    container
      .bind('Octokit')
      .toConstantValue({
        rest: {
          checks: {
            create: mockChecksCreate,
            update: mockChecksUpdate,
            listForRef: mockChecksListForRef,
          },
        },
      })
      .whenNamed('WRITE_TOKEN');

    checkRunHelper = container.get(CheckRunHelper);
  });

  test('should create a new check run when none exists', async () => {
    expect.assertions(1);

    await checkRunHelper.createOrUpdateCheckRun(
      'owner',
      'repo',
      'abc123',
      'in_progress',
      undefined,
      'Title',
      'Summary',
    );

    expect(mockChecksCreate).toHaveBeenCalledExactlyOnceWith({
      owner: 'owner',
      repo: 'repo',
      name: CHECK_RUN_NAME,
      head_sha: 'abc123',
      status: 'in_progress',
      output: { title: 'Title', summary: 'Summary' },
    });
  });

  test('should update existing check run when one is found', async () => {
    expect.assertions(2);

    mockChecksListForRef.mockResolvedValue({
      data: { check_runs: [{ id: 42 }] },
    });

    await checkRunHelper.createOrUpdateCheckRun(
      'owner',
      'repo',
      'abc123',
      'completed',
      'success',
      'Done',
      'All approved',
    );

    expect(mockChecksCreate).not.toHaveBeenCalled();
    expect(mockChecksUpdate).toHaveBeenCalledExactlyOnceWith({
      owner: 'owner',
      repo: 'repo',
      check_run_id: 42,
      status: 'completed',
      conclusion: 'success',
      output: { title: 'Done', summary: 'All approved' },
    });
  });

  test('should include conclusion when provided', async () => {
    expect.assertions(1);

    await checkRunHelper.createOrUpdateCheckRun('owner', 'repo', 'sha1', 'completed', 'failure', 'Error', 'No domains');

    expect(mockChecksCreate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ conclusion: 'failure' }));
  });

  test('should not include conclusion when undefined', async () => {
    expect.assertions(1);

    await checkRunHelper.createOrUpdateCheckRun(
      'owner',
      'repo',
      'sha1',
      'in_progress',
      undefined,
      'Pending',
      'Waiting',
    );

    expect(mockChecksCreate).toHaveBeenCalledExactlyOnceWith(
      expect.not.objectContaining({ conclusion: expect.anything() }),
    );
  });

  test('should create new check run when reverting to in_progress even if one exists', async () => {
    expect.assertions(2);

    mockChecksListForRef.mockResolvedValue({
      data: { check_runs: [{ id: 10 }] },
    });

    await checkRunHelper.createOrUpdateCheckRun(
      'owner',
      'repo',
      'abc123',
      'in_progress',
      undefined,
      'Pending',
      'Waiting',
    );

    expect(mockChecksUpdate).not.toHaveBeenCalled();
    expect(mockChecksCreate).toHaveBeenCalledExactlyOnceWith({
      owner: 'owner',
      repo: 'repo',
      name: CHECK_RUN_NAME,
      head_sha: 'abc123',
      status: 'in_progress',
      output: { title: 'Pending', summary: 'Waiting' },
    });
  });

  test('should update existing check run without conclusion when completed with undefined conclusion', async () => {
    expect.assertions(1);

    mockChecksListForRef.mockResolvedValue({
      data: { check_runs: [{ id: 10 }] },
    });

    await checkRunHelper.createOrUpdateCheckRun('owner', 'repo', 'abc123', 'completed', undefined, 'Done', 'Summary');

    expect(mockChecksUpdate).toHaveBeenCalledExactlyOnceWith(
      expect.not.objectContaining({ conclusion: expect.anything() }),
    );
  });

  test('should include text in output when provided', async () => {
    expect.assertions(1);

    await checkRunHelper.createOrUpdateCheckRun(
      'owner',
      'repo',
      'sha1',
      'in_progress',
      undefined,
      'Title',
      'Summary',
      'Detailed text',
    );

    expect(mockChecksCreate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        output: { title: 'Title', summary: 'Summary', text: 'Detailed text' },
      }),
    );
  });

  test('should include annotations in output when provided', async () => {
    expect.assertions(1);

    const annotations = [
      {
        path: 'src/foo.ts',
        start_line: 1,
        end_line: 1,
        annotation_level: 'notice' as const,
        message: 'Domain: Alpha',
        title: 'Alpha',
      },
    ];

    await checkRunHelper.createOrUpdateCheckRun(
      'owner',
      'repo',
      'sha1',
      'in_progress',
      undefined,
      'Title',
      'Summary',
      undefined,
      annotations,
    );

    expect(mockChecksCreate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        output: { title: 'Title', summary: 'Summary', annotations },
      }),
    );
  });

  test('should truncate annotations to 50 items', async () => {
    expect.assertions(1);

    const annotations = Array.from({ length: 60 }, (_, i) => ({
      path: `src/file${i}.ts`,
      start_line: 1,
      end_line: 1,
      annotation_level: 'notice' as const,
      message: `Domain: Alpha`,
      title: 'Alpha',
    }));

    await checkRunHelper.createOrUpdateCheckRun(
      'owner',
      'repo',
      'sha1',
      'in_progress',
      undefined,
      'Title',
      'Summary',
      undefined,
      annotations,
    );

    const calledAnnotations = (mockChecksCreate.mock.calls[0][0] as Record<string, unknown>).output as Record<
      string,
      unknown
    >;

    expect(calledAnnotations.annotations).toHaveLength(50);
  });

  test('should omit text and annotations from output when undefined', async () => {
    expect.assertions(1);

    await checkRunHelper.createOrUpdateCheckRun('owner', 'repo', 'sha1', 'in_progress', undefined, 'Title', 'Summary');

    expect(mockChecksCreate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        output: { title: 'Title', summary: 'Summary' },
      }),
    );
  });

  test('should include text and annotations in update call', async () => {
    expect.assertions(1);

    mockChecksListForRef.mockResolvedValue({
      data: { check_runs: [{ id: 42 }] },
    });

    const annotations = [
      {
        path: 'src/foo.ts',
        start_line: 1,
        end_line: 1,
        annotation_level: 'notice' as const,
        message: 'Domain: Alpha',
        title: 'Alpha',
      },
    ];

    await checkRunHelper.createOrUpdateCheckRun(
      'owner',
      'repo',
      'abc123',
      'completed',
      'success',
      'Done',
      'All approved',
      'Detail text',
      annotations,
    );

    expect(mockChecksUpdate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        output: { title: 'Done', summary: 'All approved', text: 'Detail text', annotations },
      }),
    );
  });

  test('findCheckRunByName should return id when check run exists', async () => {
    expect.assertions(1);

    mockChecksListForRef.mockResolvedValue({
      data: { check_runs: [{ id: 99 }] },
    });

    const result = await checkRunHelper.findCheckRunByName('owner', 'repo', 'sha1');

    expect(result).toBe(99);
  });

  test('findCheckRunByName should return undefined when no check run exists', async () => {
    expect.assertions(1);

    const result = await checkRunHelper.findCheckRunByName('owner', 'repo', 'sha1');

    expect(result).toBeUndefined();
  });
});
