import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  createUser(dto: CreateUserDto) {
    return this.usersRepository.create(dto);
  }

  getUsers() {
    return this.usersRepository.findAll();
  }

  getUserById(userId: string) {
    return this.usersRepository.findById(userId);
  }

  getUserByEmail(email: string) {
    return this.usersRepository.findByEmail(email);
  }

  banUser(userId: string) {
    return this.usersRepository.updateStatus(userId, 'banned');
  }
}
