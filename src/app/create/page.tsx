import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/features/auth/session';
import { getStore } from '@/features/render/store';
import { PLANS } from '@/config/plans';
import { CreateForm } from './create-form';
import { initialSelection } from './composer';

export default async function CreatePage({ searchParams }: PageProps<'/create'>) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const store = getStore();
  const [balance, planId, hasPaid, jobs, params] = await Promise.all([
    store.balance(user.id),
    store.planOf(user.id),
    store.hasPaid(user.id),
    store.listJobs(user.id),
    searchParams,
  ]);
  const { limits } = PLANS[planId];
  // Newest first: the last video's settings are the creator's defaults.
  const lastJob = jobs[0] ?? null;
  const { firstRun, ...initial } = initialSelection({ params, lastJob });

  return (
    <main className="mx-auto max-w-[1344px] px-4 py-8 sm:px-8 lg:py-10 xl:px-12">
      <CreateForm
        initial={initial}
        firstRun={firstRun}
        lastThemeId={lastJob?.themeId ?? null}
        balance={balance}
        maxDurationSec={limits.maxVideoDurationSec}
        allowedTiers={[...limits.modelTiers]}
        freeTrial={!hasPaid}
      />
    </main>
  );
}
