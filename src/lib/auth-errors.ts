export function authErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const messages: Record<string, string> = {
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/invalid-credential':
      'Your email or password is incorrect. Check the spelling, or use Forgot password? to reset it. If you have not registered yet, choose Create an account.',
    'auth/wrong-password':
      'Your email or password is incorrect. Check the spelling, or use Forgot password? to reset it.',
    'auth/user-not-found':
      'Your email or password is incorrect. Check the spelling, reset your password, or create an account if you have not registered yet.',
    'auth/email-already-in-use':
      'This email already has an account. Log in or reset your password.',
    'auth/weak-password': 'Choose a stronger password with at least 8 characters.',
    'auth/password-does-not-meet-requirements':
      'This password does not meet the project password policy. Use a longer password with uppercase, lowercase, numbers, and symbols.',
    'auth/network-request-failed':
      'Cannot connect to sign-in. Check your internet connection and try again. Your entries are still here.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/user-disabled': 'This account is disabled. Contact your administrator.',
    'auth/operation-not-allowed': 'Email/password sign-in is not enabled in the Firebase project.',
    'auth/invalid-api-key': 'The Firebase API key is invalid. Check the app configuration.',
    'auth/requests-from-referer-are-blocked':
      'This app address is not allowed by the Firebase API key settings.',
  };
  return messages[code] ?? 'Could not complete the account request. Please try again.';
}
