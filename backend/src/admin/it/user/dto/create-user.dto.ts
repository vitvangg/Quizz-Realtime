import { IsString, IsEmail, IsOptional, MinLength, IsUUID, IsEnum } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsUUID('4')
  @IsOptional()
  roleId?: string;

  @IsString()
  @IsOptional()
  status?: string;
}

