import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { addAddressAction, deleteAddressAction, updateAddressAction } from '@/app/actions/customer';
import { MapPin, ChevronRight } from 'lucide-react';
import AddressManagerClient from './AddressManagerClient';

export const metadata = {
  title: 'عناويني المسجلة | بريق للعناية بالسيارات',
};

export default async function AddressesPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; kind?: string }>;
}) {
  const user = await requireRole([UserRole.CUSTOMER]);
  const query = await searchParams;

  const [customer, rawCoverageZones] = await Promise.all([
    db.customerProfile.findUnique({
      where: { userId: user.id },
      include: { addresses: { orderBy: { createdAt: 'desc' } } },
    }),
    db.coverageZone.findMany({
      where: { branch: { status: 'ACTIVE' } },
      include: {
        branch: { select: { nameAr: true } },
        areas: {
          where: { active: true },
          orderBy: [{ priority: 'asc' }, { compound: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  if (!customer) {
    redirect('/login');
  }

  const coverageZones = rawCoverageZones.map((z) => ({
    id: z.id,
    name: z.branch?.nameAr ? `${z.name} (${z.branch.nameAr})` : z.name,
    areas: z.areas.map((a) => ({
      id: a.id,
      compound: a.compound,
      district: a.district,
      city: a.city,
      governorate: a.governorate,
    })),
  }));

  async function handleAddAddress(formData: FormData) {
    'use server';
    const result = await addAddressAction(formData);
    const error = 'error' in result ? result.error : undefined;
    redirect(`/account/addresses?kind=${error ? 'error' : 'success'}&notice=${encodeURIComponent(error || 'تم حفظ العنوان بنجاح.')}`);
  }

  async function handleUpdateAddress(formData: FormData) {
    'use server';
    const result = await updateAddressAction(formData);
    const error = 'error' in result ? result.error : undefined;
    redirect(`/account/addresses?kind=${error ? 'error' : 'success'}&notice=${encodeURIComponent(error || 'تم تحديث العنوان بنجاح.')}`);
  }

  async function handleDeleteAddress(formData: FormData) {
    'use server';
    const result = await deleteAddressAction(formData);
    const error = 'error' in result ? result.error : undefined;
    redirect(`/account/addresses?kind=${error ? 'error' : 'success'}&notice=${encodeURIComponent(error || 'تم حذف العنوان.')}`);
  }

  return (
    <div className="space-y-10 pb-12" dir="rtl">
      {query.notice ? (
        <p role={query.kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-3 text-xs font-bold ${query.kind === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
          {query.notice}
        </p>
      ) : null}

      {/* Navigation Breadcrumb */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-5">
        <div>
          <Link href="/account" className="text-xs text-[#e5c45a] font-bold hover:underline flex items-center gap-1">
            <ChevronRight className="w-4 h-4 text-[#c9a227]" />
            <span>العودة للوحة حسابي</span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mt-2 flex items-center gap-2">
            <MapPin className="w-7 h-7 text-[#c9a227]" />
            <span>عناويني ومواقع تنفيذ الخدمة</span>
          </h1>
          <p className="text-xs text-neutral-400 mt-1">سجل مواقعك ومنازلكم لتسهيل اختيار موقع استقبال سيارة الخدمة المتنقلة عند الحجز.</p>
        </div>
      </div>

      <AddressManagerClient
        initialAddresses={customer.addresses}
        coverageZones={coverageZones}
        addAddressAction={handleAddAddress}
        updateAddressAction={handleUpdateAddress}
        deleteAddressAction={handleDeleteAddress}
      />
    </div>
  );
}
