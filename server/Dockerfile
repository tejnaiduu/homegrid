FROM node:20-alpine

WORKDIR /app

COPY server/package*.json ./server/
RUN npm install --prefix server

WORKDIR /app/server
COPY server .

EXPOSE 5000
CMD ["node", "src/server.js"]
