'use client';

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
  return <SubscriptionPlanManager plans={plans} services={services} branches={branches} />;
}
