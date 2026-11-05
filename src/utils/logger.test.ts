import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redactPII, logger, setCrashReporter } from './logger';

describe('Logger & PII Redaction', () => {
  let reportedErrors: any[] = [];

  beforeEach(() => {
    reportedErrors = [];
    setCrashReporter((err, ctx) => {
      reportedErrors.push({ err, ctx });
    });
  });

  it('redacts email addresses from log messages and nested objects', () => {
    const rawString = 'User usman.khan@gmail.com signed in successfully';
    expect(redactPII(rawString)).toBe('User [REDACTED_EMAIL] signed in successfully');

    const rawObj = {
      user: 'John Doe',
      contact: {
        email: 'john.doe@corporate.org',
        secondary: 'admin@shareexpense.app',
      },
    };

    const redacted = redactPII(rawObj);
    expect(redacted.contact.email).toBe('[REDACTED_EMAIL]');
    expect(redacted.contact.secondary).toBe('[REDACTED_EMAIL]');
  });

  it('redacts phone numbers from log messages and nested objects', () => {
    const rawMsg = 'Sent OTP to 03001234567 and +923121234567';
    const redacted = redactPII(rawMsg);
    expect(redacted).not.toContain('03001234567');
    expect(redacted).not.toContain('+923121234567');
    expect(redacted).toContain('[REDACTED_PHONE]');
  });

  it('redacts sensitive security fields (password, token, secret)', () => {
    const sensitive = {
      username: 'member1',
      password: 'SuperSecretPassword123!',
      idToken: 'eyJhbGciOi...',
      apiSecret: 'sk_test_xyz',
    };

    const cleaned = redactPII(sensitive);
    expect(cleaned.password).toBe('[REDACTED_SECRET]');
    expect(cleaned.idToken).toBe('[REDACTED_SECRET]');
    expect(cleaned.apiSecret).toBe('[REDACTED_SECRET]');
    expect(cleaned.username).toBe('member1');
  });

  it('routes warnings and errors to crash reporter with redacted content', () => {
    logger.warn('AuthService', 'Failed login for user hacker@evil.com with 03219876543');
    expect(reportedErrors.length).toBe(1);
    expect(reportedErrors[0].err).toContain('[REDACTED_EMAIL]');
    expect(reportedErrors[0].err).toContain('[REDACTED_PHONE]');

    logger.error('Database', new Error('Connection failed for db_user@service.internal'));
    expect(reportedErrors.length).toBe(2);
    expect(reportedErrors[1].err.message).toBe('Connection failed for [REDACTED_EMAIL]');
  });
});
