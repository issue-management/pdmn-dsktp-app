#
# Copyright (C) 2026 Red Hat, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# SPDX-License-Identifier: Apache-2.0

FROM registry.access.redhat.com/ubi10/nodejs-24-minimal:10.1 AS builder
COPY package.json pnpm-lock.yaml /opt/app-root/src/
RUN PNPM_VERSION=$(node -e "console.log(require('./package.json').packageManager.match(/pnpm@([0-9.]+)/)[1])") && \
    echo Installing pnpm version ${PNPM_VERSION} && \
    npm install --global pnpm@${PNPM_VERSION}
RUN pnpm install --frozen-lockfile
COPY . /opt/app-root/src
RUN pnpm run build

FROM registry.access.redhat.com/ubi10/nodejs-24-minimal:10.1
WORKDIR /app
COPY --from=builder /opt/app-root/src/dist/entrypoint.js /opt/app-root/src/entrypoint.js
USER 1001
EXPOSE 8080
ENV PORT=8080
CMD ["node", "/opt/app-root/src/entrypoint.js"]
