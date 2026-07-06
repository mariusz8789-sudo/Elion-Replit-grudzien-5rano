import "dotenv/config";
import { cleanEnv, str, port, makeValidator } from "envalid";

const optionalStr = makeValidator((x: string) => x);

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ["development", "production", "test"], default: "development" }),
  PORT: port({ default: 5000 }),
  DATABASE_URL: str(),
  SESSION_SECRET: str({ default: "point2point-secret-key" }),
  STRIPE_SECRET_KEY: optionalStr({ default: "" }),
  STRIPE_WEBHOOK_SECRET: optionalStr({ default: "" }),
  MAPBOX_TOKEN: optionalStr({ default: "" }),
  ALLOWED_ORIGINS: optionalStr({ default: "" }),
});
