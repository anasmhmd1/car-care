'use client';

import { PackageCheck } from 'lucide-react';
import SubscriptionPlanManager, {
  type SubscriptionPlanAdminItem,
  type SubscriptionPlanBranchOption,
  type SubscriptionPlanServiceOption,
} from '../subscriptions/SubscriptionPlanManager';

export interface SubscriptionsManagerProps {
  plans: SubscriptionPlanAdminItem[];
  services: SubscriptionPlanServiceOption[];
  branches: SubscriptionPlanBranchOption[];
}

export default function SubscriptionsManager({
  plans,
  services,
  branches,
}: SubscriptionsManagerProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-800/80 pb-5">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <PackageCheck className="size-5 text-[#cea355]" />
            تصميم وإدارة باقات وخطط الاشتراك
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            إنشاء وتعديل باقات الاشتراك للعملاء، تحديد الأسعار، مدد الصلاحية، عدد الزيارات، والفروع والخدمات المشمولة.
          </p>
        </div>
      </div>

      <SubscriptionPlanManager plans={plans} services={services} branches={branches} />
    </div>
  );
}
