# Share Expense

A group expense sharing, private money circle, and household budget management app built with React Native (Expo) and Firebase.

## Release Signing

### EAS Build (Recommended)
When building through EAS (`eas build --platform android`), keystores and credentials can be managed securely by Expo Application Services in the cloud. No keystore or password files are stored locally or in source control.

### Local Release Builds
For building release APKs or Android App Bundles locally (`./gradlew assembleRelease` or `./gradlew bundleRelease`), release signing credentials must be configured outside the repository.

Do not commit keystores or plaintext passwords to git. Set the following variables either in your user Gradle properties (`~/.gradle/gradle.properties`) or as system environment variables:

```properties
RELEASE_STORE_FILE=/path/to/your/upload-keystore.keystore
RELEASE_KEY_ALIAS=<your-key-alias>
RELEASE_STORE_PASSWORD=<your-store-password>
RELEASE_KEY_PASSWORD=<your-key-password>
```

If these properties are not set, release builds will fail with a clear configuration message, while debug builds continue using the local `debug.keystore`.
