/**
 * Production-ready Logger with PII redaction and crash reporting integration.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type CrashReporter = (error: Error | string, context?: Record<string, any>) => void;

let crashReporter: CrashReporter | null = null;

export function setCrashReporter(reporter: CrashReporter | null) {
  crashReporter = reporter;
}

// Regex patterns for PII redaction
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(\+?\d{1,4}[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
const PAK_PHONE_REGEX = /(?:\+92|0092|0)?\s*3\d{2}[\s.-]?\d{7}/g;

/**
 * Recursively redacts PII from strings, arrays, and objects.
 */
export function redactPII(input: any): any {
  if (typeof input === 'string') {
    return input
      .replace(EMAIL_REGEX, '[REDACTED_EMAIL]')
      .replace(PAK_PHONE_REGEX, '[REDACTED_PHONE]')
      .replace(PHONE_REGEX, '[REDACTED_PHONE]');
  }

  if (Array.isArray(input)) {
    return input.map(item => redactPII(item));
  }

  if (input !== null && typeof input === 'object') {
    if (input instanceof Error) {
      return {
        name: input.name,
        message: redactPII(input.message),
        stack: redactPII(input.stack),
      };
    }

    const cleaned: Record<string, any> = {};
    for (const key of Object.keys(input)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('token') ||
        lowerKey.includes('secret')
      ) {
        cleaned[key] = '[REDACTED_SECRET]';
      } else {
        cleaned[key] = redactPII(input[key]);
      }
    }
    return cleaned;
  }

  return input;
}

const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

export const logger = {
  debug: (tag: string, message?: any, ...optionalParams: any[]) => {
    if (!isDev) return; // Drop debug logs in production
    console.log(`[DEBUG][${tag}]`, message, ...optionalParams);
  },

  info: (tag: string, message?: any, ...optionalParams: any[]) => {
    const redactedMsg = isDev ? message : redactPII(message);
    const redactedParams = isDev ? optionalParams : optionalParams.map(p => redactPII(p));
    console.log(`[INFO][${tag}]`, redactedMsg, ...redactedParams);
  },

  warn: (tag: string, message?: any, ...optionalParams: any[]) => {
    const redactedMsg = redactPII(message);
    const redactedParams = optionalParams.map(p => redactPII(p));
    console.warn(`[WARN][${tag}]`, redactedMsg, ...redactedParams);

    if (crashReporter) {
      crashReporter(`[WARN][${tag}] ${typeof message === 'string' ? redactedMsg : JSON.stringify(redactedMsg)}`, {
        extra: redactedParams,
      });
    }
  },

  error: (tag: string, error?: any, ...optionalParams: any[]) => {
    const redactedErr = redactPII(error);
    const redactedParams = optionalParams.map(p => redactPII(p));
    console.error(`[ERROR][${tag}]`, redactedErr, ...redactedParams);

    if (crashReporter) {
      const errObj = error instanceof Error
        ? new Error(redactPII(error.message))
        : new Error(typeof redactedErr === 'string' ? redactedErr : JSON.stringify(redactedErr));
      if (error instanceof Error && error.stack) {
        errObj.stack = redactPII(error.stack);
      }
      crashReporter(errObj, {
        tag,
        extra: redactedParams,
      });
    }
  },
};
