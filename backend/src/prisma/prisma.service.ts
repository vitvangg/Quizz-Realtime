import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
// Import từ đường dẫn mới, không phải '@prisma/client'
import { PrismaClient } from '../../generated/prisma/client'; // Đường dẫn đến Prisma Client đã được tạo
import { PrismaPg } from '@prisma/adapter-pg'; // Adapter cho PostgreSQL

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = new PrismaPg({
      connectionString:
        process.env.DATABASE_URL ||
        'postgresql://nhan:nhan@localhost:5432/db_demo_security',
    });
    console.log('Prisma adapter created');
    super({ adapter }); // Truyền adapter vào Prisma Client
  }

  async onModuleInit() {
    await this.$connect();
    console.log('Prisma connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
