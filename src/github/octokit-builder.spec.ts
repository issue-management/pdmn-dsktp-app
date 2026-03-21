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

import { beforeEach, describe, expect, test } from 'vitest';
import { Container } from 'inversify';
import { OctokitBuilder } from './octokit-builder';

describe('test OctokitBuilder', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
    container.bind(OctokitBuilder).toSelf().inSingletonScope();
  });

  test('able to create', async () => {
    expect.assertions(1);

    const octokitBuilder = container.get(OctokitBuilder);

    const octokit = octokitBuilder.build('foo');

    expect(octokit).toBeDefined();
  });
});
