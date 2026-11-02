import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { expenseSchema, paymentSchema } from '@monivo/shared';
import { apiRequest } from './client';
import { useSession } from '@/auth/session';

export const expenseResponse = z.object({ expense: expenseSchema });
export const expensesResponse = z.object({ expenses: z.array(expenseSchema) });
const expensePage = expensesResponse.extend({
  nextCursor: z.string().nullable(),
});
const paymentPage = z.object({
  payments: z.array(paymentSchema),
  nextCursor: z.string().nullable(),
});
export function useExpenses(groupId?: string) {
  const { token, user } = useSession();
  const query = useInfiniteQuery({
    queryKey: ['expenses', user?.id, groupId ?? 'all'],
    enabled: !!token,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiRequest(
        `${groupId ? `/groups/${groupId}/expenses` : '/expenses'}?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        expensePage,
        { token, signal },
      ),
    getNextPageParam: (page) => page.nextCursor,
  });
  return {
    ...query,
    data: query.data
      ? {
          expenses: [
            ...new Map(
              query.data.pages
                .flatMap((page) => page.expenses)
                .map((e) => [e.id, e]),
            ).values(),
          ],
        }
      : undefined,
  };
}
export function usePaymentPages(pending = false) {
  const { token, user } = useSession();
  const query = useInfiniteQuery({
    queryKey: ['payments', user?.id, pending ? 'pending' : 'all'],
    enabled: !!token,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiRequest(
        `/payments?limit=20${pending ? '&pending=1' : ''}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        paymentPage,
        { token, signal },
      ),
    getNextPageParam: (page) => page.nextCursor,
  });
  return {
    ...query,
    payments: [
      ...new Map(
        (query.data?.pages.flatMap((page) => page.payments) ?? []).map((p) => [
          p.id,
          p,
        ]),
      ).values(),
    ],
  };
}
export function useExpense(id: string) {
  const { token, user } = useSession();
  return useQuery({
    queryKey: ['expense', user?.id, id],
    enabled: !!token && !!id,
    // An edit form must keep its original version so conflicts are visible,
    // rather than silently replacing a user's draft on app resume.
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      apiRequest(`/expenses/${id}`, expenseResponse, { token, signal }),
  });
}
export function useLedger() {
  const { token, user } = useSession();
  return useQuery({
    queryKey: ['ledger', user?.id],
    enabled: !!token,
    queryFn: ({ signal }) =>
      apiRequest(
        '/ledger?summary=1',
        expensesResponse.extend({
          payments: z.array(paymentSchema),
          balances: z.array(
            z.object({
              groupId: z.string(),
              groupName: z.string(),
              members: z.array(
                z.object({
                  userId: z.string(),
                  name: z.string(),
                  amount: z.number().int(),
                  availableToPay: z.number().int().min(0),
                  availableToReceive: z.number().int().min(0),
                }),
              ),
            }),
          ),
        }),
        { token, signal },
      ),
  });
}
export { money, parsePaise } from '../lib/money';
