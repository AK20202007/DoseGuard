import { getAuditLog } from '@/lib/auditLog';

export async function GET() {
  return Response.json(getAuditLog());
}
