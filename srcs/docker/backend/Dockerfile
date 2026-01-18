FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++ sqlite
COPY backend/package.json ./
RUN npm install
COPY backend/. .
RUN npm run build
EXPOSE 3000
CMD ["npm","run","dev"]
