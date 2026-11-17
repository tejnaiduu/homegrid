FROM node:20-alpine AS build

ARG VITE_API_URL=http://localhost:5000/api/v1
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app
COPY client/package*.json ./client/
RUN npm install --prefix client

WORKDIR /app/client
COPY client .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/client/dist ./dist

EXPOSE 4173
CMD ["serve", "-s", "dist", "-l", "4173"]
