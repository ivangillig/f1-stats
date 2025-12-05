FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# No copiar .env - usar variables de entorno de docker-compose

EXPOSE 4000

CMD ["node", "server.js"]
