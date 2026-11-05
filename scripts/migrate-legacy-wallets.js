#!/usr/bin/env node
/**
 * scripts/migrate-legacy-wallets.js
 *
 * Migrates legacy `walletBalance` into `monthlyWallets['2026-08']` in Firestore for
 * any user where `monthlyWallets['2026-08']` does not exist yet.
 *
 * SAFETY:
 * - DRY RUN BY DEFAULT: No writes are performed unless `--apply` is passed.
 * - Never commit the service account JSON key to git.
 *
 * USAGE:
 *   node scripts/migrate-legacy-wallets.js <path-to-service-account.json>
 *   node scripts/migrate-legacy-wallets.js <path-to-service-account.json> --apply
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
    console.error('Usage: node scripts/migrate-legacy-wallets.js <path-to-service-account.json> [--apply]');
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), serviceAccountPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: File not found at ${resolvedPath}`);
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  const db = admin.firestore();

  console.log(`\n======================================================`);
  console.log(` MIGRATING LEGACY WALLET BALANCES (2026-08)`);
  console.log(` Mode: ${isApply ? 'APPLY (Live Updates)' : 'DRY RUN (Read Only)'}`);
  console.log(` Project ID: ${serviceAccount.project_id}`);
  console.log(`======================================================\n`);

  const snapshot = await db.collection('users').get();
  console.log(`Found ${snapshot.size} total user document(s) in Firestore.\n`);

  const toMigrate = [];

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    const uid = docSnap.id;
    const name = data.name || 'Unnamed';
    const email = data.email || 'No email';
    const legacyWallet = typeof data.walletBalance === 'number' ? data.walletBalance : 0;
    const monthlyWallets = data.monthlyWallets || {};

    if (monthlyWallets['2026-08'] === undefined) {
      toMigrate.push({
        uid,
        name,
        email,
        legacyWallet,
        currentMonthlyWallets: monthlyWallets,
      });
    }
  });

  if (toMigrate.length === 0) {
    console.log(`All ${snapshot.size} user(s) already have monthlyWallets['2026-08'] recorded.`);
    console.log(`No migration needed!`);
    process.exit(0);
  }

  console.log(`Found ${toMigrate.length} user(s) missing monthlyWallets['2026-08']:\n`);
  toMigrate.forEach((u, idx) => {
    console.log(`  ${idx + 1}. [${u.uid}] ${u.name} (${u.email}) -> walletBalance: ${u.legacyWallet} => monthlyWallets['2026-08']: ${u.legacyWallet}`);
  });

  if (!isApply) {
    console.log(`\n------------------------------------------------------`);
    console.log(`[DRY RUN COMPLETE]`);
    console.log(`No changes were written to Firestore.`);
    console.log(`To apply these updates, run:`);
    console.log(`  node scripts/migrate-legacy-wallets.js "${serviceAccountPath}" --apply\n`);
  } else {
    console.log(`\nApplying updates to Firestore...`);
    const batch = db.batch();

    for (const u of toMigrate) {
      const docRef = db.collection('users').doc(u.uid);
      batch.update(docRef, {
        'monthlyWallets.2026-08': u.legacyWallet,
      });
    }

    await batch.commit();
    console.log(`Successfully migrated ${toMigrate.length} user(s) in Firestore!\n`);
  }
}

main().catch(err => {
  console.error('Fatal error during migration:', err);
  process.exit(1);
});
