import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { groupSchema } from '@monivo/shared';
import { apiRequest } from './client';
import { useSession } from '@/auth/session';

export const groupResponse = z.object({ group: groupSchema });
export function useGroups() {
  const { token, user } = useSession();
  return useQuery({
    queryKey: ['groups', user?.id],
    enabled: !!token,
    queryFn: ({ signal }) =>
      apiRequest('/groups', z.object({ groups: z.array(groupSchema) }), {
        token,
        signal,
      }),
  });
}
export function useGroup(id: string) {
  const { token, user } = useSession();
  return useQuery({
    queryKey: ['group', user?.id, id],
    enabled: !!token && !!id,
    queryFn: ({ signal }) =>
      apiRequest(`/groups/${id}`, groupResponse, { token, signal }),
  });
}
