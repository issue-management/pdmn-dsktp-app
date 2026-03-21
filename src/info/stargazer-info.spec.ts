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

import { StargazerInfo, StargazerInfoBuilder } from '/@/info/stargazer-info';

describe('stargazerInfo', () => {
  test('should set and get starredAt', () => {
    expect.assertions(1);

    const info = new StargazerInfo().withStarredAt('2026-01-01');

    expect(info.starredAt).toBe('2026-01-01');
  });

  test('should set and get id', () => {
    expect.assertions(1);

    const info = new StargazerInfo().withId('123');

    expect(info.id).toBe('123');
  });

  test('should set and get login', () => {
    expect.assertions(1);

    const info = new StargazerInfo().withLogin('user1');

    expect(info.login).toBe('user1');
  });

  test('should set and get name', () => {
    expect.assertions(1);

    const info = new StargazerInfo().withName('John Doe');

    expect(info.name).toBe('John Doe');
  });

  test('should set and get company', () => {
    expect.assertions(1);

    const info = new StargazerInfo().withCompany('Acme');

    expect(info.company).toBe('Acme');
  });

  test('should set and get bio', () => {
    expect.assertions(1);

    const info = new StargazerInfo().withBio('A developer');

    expect(info.bio).toBe('A developer');
  });

  test('should set and get email', () => {
    expect.assertions(1);

    const info = new StargazerInfo().withEmail('user@example.com');

    expect(info.email).toBe('user@example.com');
  });

  test('should set and get websiteUrl', () => {
    expect.assertions(1);

    const info = new StargazerInfo().withWebsiteUrl('https://example.com');

    expect(info.websiteUrl).toBe('https://example.com');
  });

  test('should set and get twitterUsername', () => {
    expect.assertions(1);

    const info = new StargazerInfo().withTwitterUsername('twitterUser');

    expect(info.twitterUsername).toBe('twitterUser');
  });

  test('should set and get url', () => {
    expect.assertions(1);

    const info = new StargazerInfo().withUrl('https://github.com/user1');

    expect(info.url).toBe('https://github.com/user1');
  });

  test('should set and get avatarUrl', () => {
    expect.assertions(1);

    const info = new StargazerInfo().withAvatarUrl('https://avatars.example.com/1');

    expect(info.avatarUrl).toBe('https://avatars.example.com/1');
  });

  test('should support chaining all builder methods - basic identity fields', () => {
    expect.assertions(5);

    const info = new StargazerInfo()
      .withId('42')
      .withLogin('chainUser')
      .withName('Chain User')
      .withCompany('ChainCo')
      .withBio('Bio text')
      .withEmail('chain@example.com')
      .withWebsiteUrl('https://chain.com')
      .withTwitterUsername('chainTwitter')
      .withUrl('https://github.com/chainUser')
      .withAvatarUrl('https://avatar.chain.com')
      .withStarredAt('2026-03-21');

    expect(info.id).toBe('42');
    expect(info.login).toBe('chainUser');
    expect(info.name).toBe('Chain User');
    expect(info.company).toBe('ChainCo');
    expect(info.bio).toBe('Bio text');
  });

  test('should support chaining all builder methods - contact and profile fields', () => {
    expect.assertions(5);

    const info = new StargazerInfo()
      .withId('42')
      .withLogin('chainUser')
      .withName('Chain User')
      .withCompany('ChainCo')
      .withBio('Bio text')
      .withEmail('chain@example.com')
      .withWebsiteUrl('https://chain.com')
      .withTwitterUsername('chainTwitter')
      .withUrl('https://github.com/chainUser')
      .withAvatarUrl('https://avatar.chain.com')
      .withStarredAt('2026-03-21');

    expect(info.email).toBe('chain@example.com');
    expect(info.websiteUrl).toBe('https://chain.com');
    expect(info.twitterUsername).toBe('chainTwitter');
    expect(info.url).toBe('https://github.com/chainUser');
    expect(info.avatarUrl).toBe('https://avatar.chain.com');
  });

  test('should support chaining all builder methods - starred at timestamp', () => {
    expect.assertions(1);

    const info = new StargazerInfo()
      .withId('42')
      .withLogin('chainUser')
      .withName('Chain User')
      .withCompany('ChainCo')
      .withBio('Bio text')
      .withEmail('chain@example.com')
      .withWebsiteUrl('https://chain.com')
      .withTwitterUsername('chainTwitter')
      .withUrl('https://github.com/chainUser')
      .withAvatarUrl('https://avatar.chain.com')
      .withStarredAt('2026-03-21');

    expect(info.starredAt).toBe('2026-03-21');
  });
});

describe('stargazerInfoBuilder', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
    container.bind(StargazerInfoBuilder).toSelf().inSingletonScope();
  });

  test('should be resolvable from inversify container', () => {
    expect.assertions(2);

    const builder = container.get(StargazerInfoBuilder);

    expect(builder).toBeDefined();
    expect(builder).toBeInstanceOf(StargazerInfoBuilder);
  });

  test('should build a new StargazerInfo instance', () => {
    expect.assertions(2);

    const builder = container.get(StargazerInfoBuilder);
    const info = builder.build();

    expect(info).toBeDefined();
    expect(info).toBeInstanceOf(StargazerInfo);
  });

  test('should build distinct instances on each call', () => {
    expect.assertions(1);

    const builder = container.get(StargazerInfoBuilder);
    const info1 = builder.build();
    const info2 = builder.build();

    expect(info1).not.toBe(info2);
  });
});
