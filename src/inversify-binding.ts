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

import { Container } from 'inversify';
import { OctokitBuilder } from '/@/github/octokit-builder';
import { fetchersModule } from '/@/fetchers/fetchers-module';
import { helpersModule } from '/@/helpers/helpers-module';
import { infosModule } from '/@/info/infos-module';
import { logicModule } from '/@/logic/logic-module';

export class InversifyBinding {
  private container: Container;

  constructor(
    private writeToken: string,
    private readToken: string,
  ) {}

  public async initBindings(): Promise<Container> {
    this.container = new Container();

    await this.container.loadAsync(fetchersModule);
    await this.container.loadAsync(helpersModule);
    await this.container.loadAsync(infosModule);
    await this.container.loadAsync(logicModule);

    // Token
    this.container.bind(OctokitBuilder).toSelf().inSingletonScope();
    const writeOctokit = this.container.get(OctokitBuilder).build(this.writeToken);
    this.container.bind('Octokit').toConstantValue(writeOctokit).whenNamed('WRITE_TOKEN');

    const readOctokit = this.container.get(OctokitBuilder).build(this.readToken);
    this.container.bind('Octokit').toConstantValue(readOctokit).whenNamed('READ_TOKEN');
    this.container.bind('string').toConstantValue(`token ${this.readToken}`).whenNamed('GRAPHQL_READ_TOKEN');
    this.container.bind('string').toConstantValue(`token ${this.writeToken}`).whenNamed('GRAPHQL_WRITE_TOKEN');

    this.container.bind('number').toConstantValue(50).whenNamed('MAX_SET_MILESTONE_PER_RUN');
    this.container.bind('number').toConstantValue(50).whenNamed('MAX_CREATE_MILESTONE_PER_RUN');
    this.container.bind('number').toConstantValue(50).whenNamed('MAX_UPDATE_MILESTONE_PER_RUN');

    this.container.bind('number').toConstantValue(50).whenNamed('MAX_SET_ISSUES_PER_RUN');

    return this.container;
  }
}
