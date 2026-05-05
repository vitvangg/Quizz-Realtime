import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createRoleDto: CreateRoleDto) {
    const { name, description, permissionIds } = createRoleDto;
    
    return this.prisma.role.create({
      data: {
        name,
        description,
        permissions: permissionIds ? {
          create: permissionIds.map(id => ({ permissionId: id }))
        } : undefined,
      },
      include: {
        permissions: { include: { permission: true } }
      }
    });
  }

  async findAll() {
    return this.prisma.role.findMany({
      include: {
        permissions: { include: { permission: true } }
      }
    });
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } }
      }
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async update(id: string, updateRoleDto: UpdateRoleDto) {
    const { name, description, permissionIds } = updateRoleDto;

    // To update many-to-many permissions properly in prisma, we usually delete existing ones and re-create.
    const data: any = { name, description };
    if (permissionIds) {
      data.permissions = {
        deleteMany: {},
        create: permissionIds.map(permId => ({ permissionId: permId }))
      };
    }

    return this.prisma.role.update({
      where: { id },
      data,
      include: {
        permissions: { include: { permission: true } }
      }
    });
  }

  async remove(id: string) {
    return this.prisma.role.delete({
      where: { id }
    });
  }
}

