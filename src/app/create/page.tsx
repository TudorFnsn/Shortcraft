import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/features/auth/session';
import { getStore } from '@/features/render/store';
import { PLANS } from '@/config/plans';
import { CreateForm } from './create-form';

export default async function CreatePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const store = getStore();
  const [balance, planId] = await Promise.all([store.balance(user.id), store.planOf(user.id)]);
  const { limits } = PLANS[planId];

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-12">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Create a video</h1>
        <span className="text-sm text-neutral-400">{balance.toLocaleString()} credits</span>
      </div>
      <CreateForm
        balance={balance}
        maxDurationSec={limits.maxVideoDurationSec}
        allowedTiers={[...limits.modelTiers]}
      />
    </main>
  );
}
