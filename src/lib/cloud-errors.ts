export function cloudErrorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code.includes('permission-denied'))
    return 'Access was denied. Your account role may have changed, or the project security rules still need to be deployed.';
  if (code.includes('unavailable') || code.includes('deadline-exceeded'))
    return 'Could not reach the database. Check your connection, then retry. Your form has been kept.';
  if (code.includes('resource-exhausted'))
    return 'The project has reached its free usage limit. Please try again later.';
  if (code.includes('unauthenticated'))
    return 'Your session has expired. Log in again to continue.';
  if (code.includes('aborted')) return 'This report changed. Review its latest status and retry.';
  if (
    code.includes('failed-precondition') &&
    error instanceof Error &&
    /index/i.test(error.message)
  )
    return 'This report list is waiting for a database index. Ask the project owner to finish database setup, then retry.';
  if (code.includes('not-found') || code.includes('failed-precondition'))
    return 'The database is not ready. The project owner needs to finish Firestore setup.';
  return error instanceof Error ? error.message : 'Could not save your changes. Please retry.';
}
