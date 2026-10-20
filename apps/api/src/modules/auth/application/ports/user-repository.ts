import type { User } from "../../domain/user.js";

export abstract class UserRepository {
  abstract count(): Promise<number>;
  abstract findByUsername(username: string): Promise<User | null>;
  abstract add(user: User): Promise<void>;
}
