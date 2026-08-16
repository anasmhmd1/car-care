import type { Metadata } from 'next';
import { BranchStatus, SubscriptionStatus, UserRole } from '@prisma/client';
import { notFound, redirect } from 'next/navigation';
import Navbar from '@/components/SafeNavbar';
import Footer from '@/components/Footer';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { toPublicUser } from '@/lib/auth/authorization';
import {
  cancellationPolicyRevision,
  cancellationPolicySnapshot,
} from '@/lib/policies/cancellation';
import BookingWizardClient from './BookingWizardClient';

export const metadata: Metadata = {
  title: 'إتمام الحجز المباشر',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface BookingPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BookServicePage({ params, searchParams }: BookingPageProps) {
  const [{ slug }, query, user] = await Promise.all([params, searchParams, getCurrentUser().catch(() => null)]);

  // If user is logged in as non-customer (e.g. employee or admin), redirect to services or allow testing
  if (user && user.role !== UserRole.CUSTOMER && user.role !== UserRole.OWNER && user.role !== UserRole.SYSTEM_SUPER_ADMIN) {
    redirect('/services');
  }

  const now = new Date();
  const [service, coverageAreas, paymentMethods, customer, supportContact] = await Promise.all([
    db.service.findFirst({
      where: {
        slug,
        active: true,
        bookableOnline: true,
        cancellationPolicy: { active: true },
      },
      select: {
        id: true,
        nameAr: true,
        basePrice: true,
        requiresDeposit: true,
        requiresFullPrepayment: true,
        depositType: true,
        depositValue: true,
        cancellationPolicy: true,
        variants: {
          select: {
            id: true,
            vehicleSize: true,
            price: true,
            durationMinutes: true,
          },
        },
        addonLinks: {
          where: { addon: { active: true } },
          select: {
            addon: {
              select: {
                id: true,
                nameAr: true,
                price: true,
                durationMinutes: true,
              },
            },
          },
        },
      },
    }),
    db.coverageArea.findMany({
      where: {
        active: true,
        zone: {
          branch: {
            status: BranchStatus.ACTIVE,
            OR: [
              { services: { none: { service: { slug } } } },
              {
                services: {
                  some: {
                    service: { slug },
                    active: true,
                    bookableOnline: true,
                  },
                },
              },
            ],
          },
        },
      },
      orderBy: [{ priority: 'asc' }, { compound: 'asc' }],
      select: {
        id: true,
        governorate: true,
        city: true,
        district: true,
        compound: true,
        zone: {
          select: {
            id: true,
            name: true,
            branchId: true,
            branch: { select: { nameAr: true } },
          },
        },
      },
    }),
    db.branchPaymentMethod.findMany({
      where: {
        active: true,
        branch: { status: BranchStatus.ACTIVE },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        branchId: true,
        name: true,
        type: true,
        accountNumber: true,
        accountName: true,
        instructions: true,
        isDefault: true,
      },
    }),
    user
      ? db.customerProfile.findUnique({
          where: { userId: user.id },
          select: {
            creditBalance: true,
            vehicles: {
              orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
              select: {
                id: true,
                make: true,
                model: true,
                year: true,
                color: true,
                vehicleSize: true,
                plateNumber: true,
                isDefault: true,
              },
            },
            addresses: {
              orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
              select: {
                id: true,
                governorate: true,
                city: true,
                district: true,
                compound: true,
                street: true,
                buildingNumber: true,
                unitNumber: true,
                landmark: true,
                gateInstructions: true,
                locationUrl: true,
                isDefault: true,
              },
            },
            subscriptions: {
              where: {
                status: SubscriptionStatus.ACTIVE,
                startDate: { lte: now },
                endDate: { gt: now },
                remainingVisits: { gt: 0 },
              },
              orderBy: { endDate: 'asc' },
              select: {
                id: true,
                branchId: true,
                remainingVisits: true,
                endDate: true,
                plan: {
                  select: {
                    id: true,
                    nameAr: true,
                    services: { select: { serviceId: true } },
                    branches: { select: { branchId: true } },
                  },
                },
                vehicles: { select: { vehicleId: true } },
                serviceBalances: {
                  select: {
                    serviceId: true,
                    remainingVisits: true,
                    service: { select: { nameAr: true } },
                  },
                },
              },
            },
          },
        })
      : null,
    db.branch.findFirst({
      where: { status: BranchStatus.ACTIVE },
      orderBy: { createdAt: 'asc' },
      select: { phone: true, whatsapp: true },
    }),
  ]);

  if (!service) {
    notFound();
  }

  const cancellationPolicy = {
    ...cancellationPolicySnapshot(service.cancellationPolicy),
    revision: cancellationPolicyRevision(service.cancellationPolicy),
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#050505] font-sans text-white selection:bg-[#cea355] selection:text-black">
      <Navbar user={user} />

      <main id="main-content" className="mx-auto w-full max-w-4xl flex-1 px-4 pb-24 pt-32 sm:px-6 lg:px-8">
        <BookingWizardClient
          user={user ? toPublicUser(user) : null}
          service={{ ...service, cancellationPolicy }}
          coverageAreas={coverageAreas}
          paymentMethods={paymentMethods}
          vehicles={customer?.vehicles ?? []}
          addresses={customer?.addresses ?? []}
          subscriptions={(customer?.subscriptions ?? []).map((subscription) => ({
            ...subscription,
            endDate: subscription.endDate.toISOString(),
          }))}
          creditBalance={customer?.creditBalance ?? 0}
          supportContact={supportContact}
          initialSelection={{
            vehicleId: firstSearchParam(query.vehicleId),
            addressId: firstSearchParam(query.addressId),
            subscriptionId: firstSearchParam(query.subscriptionId),
          }}
        />
      </main>

      <Footer />
    </div>
  );
}
