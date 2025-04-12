interface ThrottlingOptionsWithAny {
  onRateLimit: (retryAfter: number, options: Record<string, unknown>) => boolean;
  onSecondaryRateLimit: (retryAfter: number, options: Record<string, unknown>) => boolean;
}

export const RATE_LIMIT_CONFIG: ThrottlingOptionsWithAny = {
  onRateLimit: (retryAfter: number, options: Record<string, unknown>) => {
    console.warn(
      `Request quota exhausted for request ${options.method} ${options.url}. Retrying after ${retryAfter} seconds.`
    );

    return true;
  },
  onSecondaryRateLimit: (retryAfter: number, options: Record<string, unknown>) => {
    console.warn(
      `Secondary rate limit hit for request ${options.method} ${options.url}. Retrying after ${retryAfter} seconds.`
    );

    return true;
  },
};

export const MAX_RETRIES = 3;
export const INITIAL_RETRY_DELAY = 1000;
export const MAX_RETRY_DELAY = 10000;
