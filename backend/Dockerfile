FROM node:20-slim AS base

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm install
RUN npm run prisma:generate
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/main.js"]
