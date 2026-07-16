FROM node:22-alpine

WORKDIR /app

COPY . .

# Install a simple static server
RUN npm install --global http-server

EXPOSE 3000

CMD ["http-server", "-p", "3000", "-g"]
