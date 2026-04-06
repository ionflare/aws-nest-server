export class CreateUserDto {
  username!: string;
  email!: string;
  passwordHash!: string;
  displayName!: string;
  status?: 'active' | 'banned' | 'deleted';
}
