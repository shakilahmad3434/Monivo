import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { expenseSchema, paymentSchema } from '@monivo/shared';
import { apiRequest } from './client';
import { useSession } from '@/auth/session';

export const expenseResponse = z.object({ expense: expenseSchema });
export const expensesResponse = z.object({ expenses: z.array(expenseSchema) });
export function useExpenses(groupId: string) {
  const { token, user } = useSession();
  return useQuery({
    queryKey: ['expenses', user?.id, groupId],
    enabled: !!token && !!groupId,
    queryFn: () =>
      apiRequest(`/groups/${groupId}/expenses`, expensesResponse, { token }),
  });
}
export function useExpense(id: string) {
  const { token, user } = useSession();
  return useQuery({
    queryKey: ['expense', user?.id, id],
    enabled: !!token && !!id,
    queryFn: () => apiRequest(`/expenses/${id}`, expenseResponse, { token }),
  });
}
export function useLedger() {
  const { token, user } = useSession();
  return useQuery({
    queryKey: ['ledger', user?.id],
    enabled: !!token,
    queryFn: () =>
      apiRequest(
        '/ledger',
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
        { token },
      ),
  });
}
export { money, parsePaise } from '../lib/money';
