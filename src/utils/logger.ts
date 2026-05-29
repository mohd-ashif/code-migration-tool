const timestamp = () => new Date().toISOString();
const prefix = (level: string, message: string) => `[${timestamp()}] [${level}] ${message}`;

export const logger = {
  debug: (message: string) => {
    if (process.env.NODE_ENV !== "production") {
      console.debug(prefix("DEBUG", message));
    }
  },
  info: (message: string) => {
    console.log(prefix("INFO", message));
  },
  warn: (message: string) => {
    console.warn(prefix("WARN", message));
  },
  error: (message: string) => {
    console.error(prefix("ERROR", message));
  },
};
