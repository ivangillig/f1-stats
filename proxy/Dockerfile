FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# better-sqlite3 is a native module: build deps cover platforms without a
# matching prebuilt binary (e.g. alpine/musl on ARM)
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && npm ci --omit=dev \
  && apk del .build-deps

COPY . .

# No copiar .env - usar variables de entorno de docker-compose

EXPOSE 4000

CMD ["node", "server.js"]
