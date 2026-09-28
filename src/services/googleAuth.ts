import { GoogleSignin, statusCodes, isErrorWithCode } from '@react-native-google-signin/google-signin';
import auth from '@react-native-firebase/auth';
import { GOOGLE_WEB_CLIENT_ID } from '../config';

let configured = false;

function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  configured = true;
}

export type GoogleSignInOutcome =
  | { status: 'success' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export async function signInWithGoogle(): Promise<GoogleSignInOutcome> {
  ensureConfigured();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();

    // Начиная с v13 SDK результат обёрнут в { type, data }; на отмене type === 'cancelled'.
    if (response.type === 'cancelled') return { status: 'cancelled' };

    const idToken = response.data.idToken;
    if (!idToken) return { status: 'error', message: 'Google не вернул токен входа' };

    const credential = auth.GoogleAuthProvider.credential(idToken);
    await auth().signInWithCredential(credential);
    // Профиль и гараж заведёт ensureUserBootstrapped (services/firebase.ts) при входе.

    return { status: 'success' };
  } catch (err) {
    if (isErrorWithCode(err)) {
      switch (err.code) {
        case statusCodes.SIGN_IN_CANCELLED:
          return { status: 'cancelled' };
        case statusCodes.IN_PROGRESS:
          return { status: 'error', message: 'Вход уже выполняется' };
        case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
          return { status: 'error', message: 'Google Play Services недоступны на этом устройстве' };
        default:
          return { status: 'error', message: 'Не удалось войти через Google' };
      }
    }
    return { status: 'error', message: 'Не удалось войти через Google' };
  }
}
