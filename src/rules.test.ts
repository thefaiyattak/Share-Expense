import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Step 15: Security Rules Verification', () => {
  const firestoreRules = fs.readFileSync(path.resolve('./firestore.rules'), 'utf8');
  const storageRules = fs.readFileSync(path.resolve('./storage.rules'), 'utf8');

  it('firestore.rules enforces strictly private personal loans', () => {
    // Assert loan match block exists
    expect(firestoreRules).toContain('match /personal_loans/{loanId}');
    // Must ONLY allow read if auth.uid is lenderId or borrowerId (third members cannot read)
    expect(firestoreRules).toMatch(
      /resource\.data\.lenderId\s*==\s*request\.auth\.uid\s*\|\|\s*resource\.data\.borrowerId\s*==\s*request\.auth\.uid/
    );
  });

  it('firestore.rules enforces append-only audit logs (no update, no delete)', () => {
    const editHistorySection = firestoreRules.slice(
      firestoreRules.indexOf('match /editHistory/{id}'),
      firestoreRules.indexOf('match /syncOps/{opId}')
    );
    expect(editHistorySection).toContain('allow create: if isAuthenticated();');
    expect(editHistorySection).toContain('allow update, delete: if false;');
  });

  it('firestore.rules restricts expense reads to team members only', () => {
    const expenseSection = firestoreRules.slice(
      firestoreRules.indexOf('match /expenses/{expId}'),
      firestoreRules.indexOf('match /attendance/{attId}')
    );
    expect(expenseSection).toContain('allow read: if isAuthenticated() && isMemberOfTeam(resource.data.teamId);');
    expect(expenseSection).toContain('request.resource.data.userId == request.auth.uid');
  });

  it('firestore.rules restricts expense updates/deletions to author or team admin', () => {
    const expenseSection = firestoreRules.slice(
      firestoreRules.indexOf('match /expenses/{expId}'),
      firestoreRules.indexOf('match /attendance/{attId}')
    );
    expect(expenseSection).toContain('resource.data.userId == request.auth.uid');
    expect(expenseSection).toContain('isTeamAdmin(resource.data.teamId)');
  });

  it('firestore.rules restricts syncOps idempotency markers to creator, immutable', () => {
    const syncOpsSection = firestoreRules.slice(
      firestoreRules.indexOf('match /syncOps/{opId}'),
      firestoreRules.indexOf('match /personal_loans/{loanId}')
    );
    expect(syncOpsSection).toContain('allow read: if isAuthenticated() && resource.data.uid == request.auth.uid;');
    expect(syncOpsSection).toContain('allow create: if isAuthenticated() && request.resource.data.uid == request.auth.uid;');
    expect(syncOpsSection).toContain('allow update, delete: if false;');
  });

  it('storage.rules restricts receipts and enforces size and image type constraints', () => {
    expect(storageRules).toContain('match /receipts/{filename}');
    expect(storageRules).toContain('isImage()');
    expect(storageRules).toContain('isUnder10MB()');
  });
});
