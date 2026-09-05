/** Only fixed, safe messages cross the provider boundary. Never retain provider bodies/URLs. */
export class OnboardingError extends Error {
  constructor(public readonly code: string, public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'OnboardingError';
  }
}
export function providerUnavailable(): OnboardingError {
  return new OnboardingError('poi_provider_unavailable', 502, '附近搜索暂时不可用，请稍后重试');
}
export function requestCancelled(): OnboardingError {
  return new OnboardingError('poi_request_cancelled', 499, '搜索已取消');
}
