import { type DynamicModule, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { CqrsModule } from "@nestjs/cqrs";
import { APP_CONFIG, type AppConfig } from "../../shared/config.js";
import { LoginHandler } from "./application/commands/login.handler.js";
import { LogoutHandler } from "./application/commands/logout.handler.js";
import { SetupHandler } from "./application/commands/setup.handler.js";
import { PasswordHasher } from "./application/ports/password-hasher.js";
import { SessionRepository } from "./application/ports/session-repository.js";
import { SetupTokenStore } from "./application/ports/setup-token-store.js";
import { UserRepository } from "./application/ports/user-repository.js";
import { GetSessionHandler } from "./application/queries/get-session.handler.js";
import { MemorySetupTokenStore } from "./infrastructure/memory-setup-token.store.js";
import { ScryptPasswordHasher } from "./infrastructure/scrypt-password-hasher.js";
import { type Db, openDatabase } from "./infrastructure/sqlite-database.js";
import { SqliteSessionRepository } from "./infrastructure/sqlite-session.repository.js";
import { SqliteUserRepository } from "./infrastructure/sqlite-user.repository.js";
import { AuthController } from "./presentation/auth.controller.js";
import { AuthGuard } from "./presentation/auth.guard.js";

const DB = Symbol("DB");

@Module({})
export class AuthModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AuthModule,
      imports: [CqrsModule],
      controllers: [AuthController],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: DB, useFactory: () => openDatabase(config.dataDir) },
        {
          provide: UserRepository,
          useFactory: (db: Db) => new SqliteUserRepository(db),
          inject: [DB],
        },
        {
          provide: SessionRepository,
          useFactory: (db: Db) => new SqliteSessionRepository(db),
          inject: [DB],
        },
        { provide: PasswordHasher, useClass: ScryptPasswordHasher },
        {
          provide: SetupTokenStore,
          useFactory: async (users: UserRepository) => {
            const store = new MemorySetupTokenStore((await users.count()) === 0);
            const token = store.current();
            if (token) {
              console.log(`\nNautix first run. Setup token (one-time): ${token}\n`);
            }
            return store;
          },
          inject: [UserRepository],
        },
        { provide: APP_GUARD, useClass: AuthGuard },
        SetupHandler,
        LoginHandler,
        LogoutHandler,
        GetSessionHandler,
      ],
    };
  }
}
