FROM node:22-bullseye-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=development

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      ffmpeg \
      fonts-dejavu-core \
      fonts-liberation \
      tini \
      unzip \
      xvfb \
      zip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev
RUN npm install --global @anthropic-ai/claude-code @openai/codex

COPY . .
RUN npm run build:factory

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "run", "start:cli"]
