#!/usr/bin/env node
/**
 * scripts/list-stub-password-accounts.js
 *
 * Scans Firebase Auth users for accounts that were likely provisioned using the
 * legacy GoogleAuthStub pattern (stub password derived from email prefix).
 *
 * HEURISTIC:
 * - The user has a 'password' provider in Auth (providerData contains providerId === 'password').
 * - The user's Firestore profile doc (users/{uid}) does NOT have `hasPasswordSet === true`.
 *
 * HEURISTIC LIMITS:
 * - If an older email/password user signed up before `hasPasswordSet` was introduced and has
 *   never changed their password in Settings, they will also be identified by this heuristic.
 *   Running --apply on them is safe, but will require them to set/reset their password using
 *   the generated link before logging in again with a password.
 *
 * USAGE:
 *   node scripts/list-stub-password-accounts.js <path-to-service-account.json> [--apply]
 *   or:
 *   node scripts/list-stub-password-accounts.js --service-account <path-to-service-account.json> [--apply]
 *
 * SAFETY:
 *   - DRY RUN BY DEFAULT: No changes made unless --apply is explicitly passed.
 *   - NEVER commit the service account JSON file to git!
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');

  let serviceAccountPath = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--service-account' && args[i + 1]) {
      serviceAccountPath = args[i + 1];
      break;
    } else if (!args[i].startsWith('--')) {
      serviceAccountPath = args[i];
      break;
    }
  }

  if (!serviceAccountPath) {
    console.error('Error: Missing service account JSON path.');
    console.error('Usage: node scripts/list-stub-password-accounts.js <path-to-service-account.json> [--apply]');
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), serviceAccountPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: File not found at ${resolvedPath}`);
    process.exit(1);
  }

  // Ensure service account is not stored inside git tracking
  if (resolvedPath.startsWith(process.cwd()) && !resolvedPath.includes('.gitignore')) {
    console.warn('\n[CAUTION] Ensure your service account file is stored OUTSIDE this repository or added to .gitignore.\n');
  }

  const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  const auth = admin.auth();
  const db = admin.firestore();

  console.log('===============================================================');
  console.log(`MODE: ${isApply ? 'APPLY (Active modification)' : 'DRY RUN (Read-only simulation)'}`);
  console.log('HEURISTIC: Auth provider has "password" AND Firestore users/{uid}.hasPasswordSet !== true');
  console.log('===============================================================\n');

  let nextPageToken;
  let totalAuthUsers = 0;
  const flaggedUsers = [];

  do {
    const listResult = await auth.listUsers(1000, nextPageToken);
    totalAuthUsers += listResult.users.length;

    for (const userRecord of listResult.users) {
      const hasPasswordProvider = userRecord.providerData.some(p => p.providerId === 'password');
      if (!hasPasswordProvider) {
        continue;
      }

      // Check Firestore doc
      const userDocRef = db.collection('users').doc(userRecord.uid);
      const userDoc = await userDocRef.get();
      const userData = userDoc.exists ? userDoc.data() : null;

      const hasPasswordSet = userData && userData.hasPasswordSet === true;

      if (!hasPasswordSet) {
        flaggedUsers.push({
          uid: userRecord.uid,
          email: userRecord.email || '(no email)',
          displayName: userRecord.displayName || userData?.name || '(no name)',
          providers: userRecord.providerData.map(p => p.providerId).join(', '),
          createdAt: userRecord.metadata.creationTime,
          hasFirestoreDoc: userDoc.exists,
        });
      }
    }

    nextPageToken = listResult.pageToken;
  } while (nextPageToken);

  console.log(`Total Auth Users Scanned: ${totalAuthUsers}`);
  console.log(`Potentially vulnerable stub-password accounts found: ${flaggedUsers.length}\n`);

  if (flaggedUsers.length === 0) {
    console.log('No vulnerable stub-password accounts detected.');
    process.exit(0);
  }

  console.log('Identified Accounts:');
  console.table(
    flaggedUsers.map(u => ({
      UID: u.uid,
      Email: u.email,
      Name: u.displayName,
      Providers: u.providers,
      Created: u.createdAt,
    }))
  );

  if (!isApply) {
    console.log('\n[DRY RUN COMPLETE] No accounts modified.');
    console.log('To revoke refresh tokens and generate password reset links for these users, run with --apply:');
    console.log(`  node scripts/list-stub-password-accounts.js "${serviceAccountPath}" --apply\n`);
  } else {
    console.log('\n[APPLYING REMEDIATION] Revoking refresh tokens and generating password reset links...\n');
    for (const user of flaggedUsers) {
      if (!user.email || user.email === '(no email)') {
        console.warn(`Skipping reset link for UID ${user.uid} (no email address).`);
        continue;
      }

      try {
        await auth.revokeRefreshTokens(user.uid);
        const resetLink = await auth.generatePasswordResetLink(user.email);
        console.log(`[REVOKED & LINK GENERATED]`);
        console.log(`  User: ${user.email} (${user.uid})`);
        console.log(`  Reset Link: ${resetLink}\n`);
      } catch (err) {
        console.error(`Failed to process UID ${user.uid} (${user.email}):`, err.message);
      }
    }
    console.log('Remediation complete. Distribute the password reset links to the affected users.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
