FROM oven/bun:1 AS base

RUN mkdir -p /usr/src/preservetube/backend
WORKDIR /usr/src/preservetube/backend

COPY . /usr/src/preservetube/backend
RUN bun install

CMD ["bun", "run", "src/index.ts"]