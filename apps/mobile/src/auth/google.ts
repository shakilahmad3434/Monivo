import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

export const googleConfigured = !!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
export const supportsGoogleSignIn =
  Platform.OS === 'android' &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

export async function googleIdToken(): Promise<string | null> {
  if (!googleConfigured)
    throw new Error('Google sign-in setup is not complete yet.');
  if (!supportsGoogleSignIn)
    throw new Error(
      'Google sign-in needs the Monivo Android development build.',
    );
  // Lazy import keeps Expo Go and web sample previews usable without this native module.
  const { GoogleSignin, isSuccessResponse } =
    await import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return null;
  if (!response.data.idToken)
    throw new Error(
      'Google did not return a sign-in token. Check the Web client ID.',
    );
  return response.data.idToken;
}
