export interface AppUser {
  user_id: string | number;
  username: string;
  email: string;
  password_hash: string;
  display_name: string;
  status: 'active' | 'banned' | 'deleted';
  created_at: Date;
  updated_at: Date;
}
