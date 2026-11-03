import { ApiError } from '../shared/http'

export function isOrchestratorDownError(e: unknown): boolean {
  if (e instanceof TypeError) return true
  if (e instanceof ApiError) return e.status >= 500
  return false
}

export function isSessionExpiredError(e: unknown): boolean {
  if (e instanceof ApiError) return e.status === 401 || e.status === 403
  return false
}
