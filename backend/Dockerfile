FROM node:20-slim AS base
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY prisma ./prisma
RUN npm run prisma:generate
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/main.js"]
