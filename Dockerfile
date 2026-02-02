# 1. Chọn môi trường chạy (Base Image)
FROM node:20-alpine

# 2. Tạo thư mục làm việc trong container
WORKDIR /app

# 3. Copy file quản lý thư viện vào trước để tận dụng cache
COPY package*.json ./

# 4. Cài đặt các thư viện
RUN npm install --legacy-peer-deps

# 5. Copy toàn bộ mã nguồn vào container
COPY . .

# 6. Mở cổng mà ứng dụng chạy (VD: 3000)
EXPOSE 3000

# 7. Lệnh để khởi chạy ứng dụng
CMD ["npm", "start"]