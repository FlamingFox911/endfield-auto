FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* tsconfig.json ./
COPY src ./src

RUN npm install && npm run build

FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY --from=build /app/dist ./dist

RUN npm install --omit=dev

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

CMD ["node", "dist/app/main.js"]
