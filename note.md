# Back-end

- cài đặt cli: npm i -g @nestjs/cli

### generate resource

- nest g resource users ( sau đó chọn restapi + crud)
  nó sẽ tạo ra full luôn 1 cái users trong src : sẽ bao gồm full dto entity các kiểu

# database

- tạo model trong folder schema
  => npm run prisma:generate

### Người tạo thêm db + thay đổi db

- b1: phải tạo model trong schema.prisma (làm theo form mẫu)
- b2: chạy lệnh:

## npx prisma migrate dev --name "ten-thay-doi"

=> nó sẽ tạo ra 1 folder migrations - bên trong đó sẽ có câu lệnh sql tạo bảng đó
-> vào pgadmin refresh sẽ thấy có bảng các kiểu

## development


## Người update db
npx prisma migrate dev --name "change_database_to_new"
npx prisma migrate deploy

## người lấy db về 
npx prisma generate
option: npx prisma migrate dev
