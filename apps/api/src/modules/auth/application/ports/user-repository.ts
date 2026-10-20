import type { User } from "../../domain/user.js";

export abstract class UserRepository {
  abstract count(): Promise<number>;
  abstract countAdmins(): Promise<number>;
  abstract list(): Promise<User[]>;
  abstract findById(id: string): Promise<User | null>;
  abstract findByUsername(username: string): Promise<User | null>;
  abstract add(user: User): Promise<void>;
  abstract setPasswordHash(id: string, passwordHash: string): Promise<void>;
  abstract remove(id: string): Promise<void>;
}
