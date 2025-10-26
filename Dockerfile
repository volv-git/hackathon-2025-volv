FROM node:18

# Tạo thư mục app
WORKDIR /app

# Copy file
COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "bot.js"]
