import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    const { email, password, roleId, status } = createUserDto;

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    return this.prisma.user.create({
      data: {
        email,
        passwordHash,
        roleId,
        status: status || 'ACTIVE',
      },
      select: {
        id: true,
        email: true,
        roleId: true,
        status: true,
        createdAt: true,
        role: true,
      }
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        roleId: true,
        status: true,
        createdAt: true,
        role: true,
      }
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        roleId: true,
        status: true,
        createdAt: true,
        role: true,
      }
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const { email, password, roleId, status } = updateUserDto;
    
    const data: any = {};
    if (email) data.email = email;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      data.passwordHash = await bcrypt.hash(password, salt);
    }
    if (roleId !== undefined) data.roleId = roleId;
    if (status) data.status = status;

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        roleId: true,
        status: true,
        createdAt: true,
        role: true,
      }
    });
  }

  async remove(id: string) {
    return this.prisma.user.delete({
      where: { id }
    });
  }
}

