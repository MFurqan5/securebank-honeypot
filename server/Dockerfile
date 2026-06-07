FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy the server source code
COPY . .

EXPOSE 5000

CMD ["node", "server.js"]
