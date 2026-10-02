import { describeMemberRequestException, readMemberRequestFailure } from '@/lib/portal/memberRequestFailure';

export class AgreementRequestError extends Error {}
export async function requireAgreementResponse(response: Response): Promise<void> {
  if (!response.ok) throw new AgreementRequestError(await readMemberRequestFailure(response));
}
export function agreementRequestError(error: unknown): string {
  return error instanceof AgreementRequestError ? error.message : describeMemberRequestException(error);
}
