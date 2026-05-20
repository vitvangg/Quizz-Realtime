import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';
import * as bcrypt from 'bcryptjs';
// Import Prisma types for accurate data structure

@Injectable()
export class UserService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) { }

  async create(createUserDto: CreateUserDto) {
    const { password, ...data } = createUserDto;
    const hashedPassword = await bcrypt.hash(password, 10);
    return this.prismaService.user.create({
      data: {
        ...data,
        passwordHash: hashedPassword,
      },
      include: { role: true }
    });
  }

  findByEmail(email: string) {
    return this.prismaService.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prismaService.user.findUnique({
      where: { id },
      include: { role: true }
    });
  }

  getAll() {
    return this.prismaService.user.findMany({
      where: {
        NOT: { status: 'DELETED' }
      },
      include: { role: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const { password, ...data } = updateUserDto;
    const updateData: any = { ...data };

    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    return this.prismaService.user.update({
      where: { id },
      data: updateData,
      include: { role: true }
    });
  }

  remove(id: string) {
    return this.prismaService.user.update({
      where: { id },
      data: { status: 'DELETED' }
    });
  }

  async uploadAvatar(id: string, file: Express.Multer.File) {
    const user = await this.findById(id);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Upload to Cloudinary
    const result = await this.cloudinaryService.uploadFile(file, 'avatars');

    // Delete old avatar if exists
    if (user.avatarId) {
      await this.cloudinaryService.deleteFile(user.avatarId);
    }

    // Update user in DB
    return this.prismaService.user.update({
      where: { id },
      data: {
        avatar: result.secure_url,
        avatarId: result.public_id,
      },
    });
  }
}
