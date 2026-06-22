FROM node:26-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY server.js .
COPY public/ ./public/

EXPOSE 3001

CMD ["node", "server.js"]
