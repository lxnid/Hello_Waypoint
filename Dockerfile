FROM node:24-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@10.32.1
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production SERVE_CLIENT=true PORT=3000 HOST=0.0.0.0
RUN npm install -g pnpm@10.32.1
COPY --from=build /app /app
EXPOSE 3000
CMD ["node", "server/dist/main.js"]
