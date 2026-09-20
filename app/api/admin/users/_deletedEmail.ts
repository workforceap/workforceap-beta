// The marker format now lives in lib so the member deletion paths
// (lib/member/anonymizeMember.ts) and these admin routes share one definition.
export {
  buildDeletedEmail,
  isDeletedEmail,
  isDeletedEmailMarker,
  parseDeletedEmail,
} from '@/lib/member/deletedEmail';
