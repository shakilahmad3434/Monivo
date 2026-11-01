import { router } from 'expo-router';
import { ErrorState, Screen } from '@/components/screen';

export default function NotFoundScreen() {
  return (
    <Screen title="A wrong turn." back>
      <ErrorState
        message="This page isn't part of your Monivo space."
        onRetry={() => router.replace('/')}
      />
    </Screen>
  );
}
