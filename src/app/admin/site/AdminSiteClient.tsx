'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Layers,
  Repeat,
  PackageCheck,
  ImageIcon,
  Share2,
  ShieldCheck,
  Compass,
  HelpCircle,
  ExternalLink,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import CollectionsManager from './CollectionsManager';
import GalleryManager from './GalleryManager';
import PoliciesManager from './PoliciesManager';
import SiteContentManager from './SiteContentManager';
import SocialContactManager from './SocialContactManager';
import ZonesCoverageManager, { type CoverageZoneItem } from './ZonesCoverageManager';
import ServicesManager, {
  type CatalogMaterialDto,
  type SiteServiceDto,
} from './ServicesManager';
import SubscriptionsManager from './SubscriptionsManager';
import {
  type SubscriptionPlanAdminItem,
  type SubscriptionPlanBranchOption,
  type SubscriptionPlanServiceOption,
} from '../subscriptions/SubscriptionPlanManager';
import { type ServiceCollection } from '@/lib/service-collections';
import { type FaqItem, type HomepageContent } from '@/lib/homepage-content';
import { type GalleryItem } from '@/lib/gallery-items';
import { type PoliciesContent } from '@/lib/policies-content';
import { type SocialLinks, DEFAULT_SOCIAL_LINKS } from '@/lib/social-links';

interface ServiceOption {
  id: string;
  nameAr: string;
  slug: string;
  basePrice: number;
  durationMinutes: number;
}

interface BranchContactDto {
  id: string;
  nameAr: string;
  phone: string;
  whatsapp: string;
}

export type TabKey =
  | 'services'
  | 'subscriptions'
  | 'collections'
  | 'gallery'
  | 'policies'
  | 'social'
  | 'zones'
  | 'faqs';

interface AdminSiteClientProps {
  initialCollections: ServiceCollection[];
  availableServices: ServiceOption[];
  fullServices?: SiteServiceDto[];
  materials?: CatalogMaterialDto[];
  plans?: SubscriptionPlanAdminItem[];
  subscriptionServices?: SubscriptionPlanServiceOption[];
  subscriptionBranches?: SubscriptionPlanBranchOption[];
  initialContent: HomepageContent;
  initialFaqs: FaqItem[];
  initialZones: CoverageZoneItem[];
  initialGallery: GalleryItem[];
  initialPolicies: PoliciesContent;
  initialSocialLinks?: SocialLinks;
  branches?: BranchContactDto[];
  activeBranch?: BranchContactDto | null;
  defaultBranchId: string;
  initialTab?: string;
  initialServiceId?: string;
  isNewService?: boolean;
}

export default function AdminSiteClient({
  initialCollections,
  availableServices,
  fullServices = [],
  materials = [],
  plans = [],
  subscriptionServices = [],
  subscriptionBranches = [],
  initialContent,
  initialFaqs,
  initialZones,
  initialGallery,
  initialPolicies,
  initialSocialLinks = DEFAULT_SOCIAL_LINKS,
  branches = [],
  activeBranch,
  defaultBranchId,
  initialTab,
  initialServiceId,
  isNewService,
}: AdminSiteClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const validTabs: TabKey[] = [
      'services',
      'subscriptions',
      'collections',
      'gallery',
      'policies',
      'social',
      'zones',
      'faqs',
    ];
    if (initialTab && validTabs.includes(initialTab as TabKey)) {
      return initialTab as TabKey;
    }
    return 'services';
  });

  return (
    <main
      className="min-h-screen bg-[#050505] px-4 py-10 text-white sm:px-6 lg:px-8 font-sans selection:bg-[#cea355] selection:text-black"
      dir="rtl"
    >
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <header className="flex flex-col gap-6 border-b border-neutral-800 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-xs font-bold text-[#cea355] tracking-wider uppercase">
              <Sparkles className="size-4" aria-hidden="true" />
              إدارة واجهة وهوية المنصة
            </p>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              إدارة محتوى الموقع والتغطية والسياسات
            </h1>
            <p className="max-w-3xl text-xs sm:text-sm text-neutral-400 leading-relaxed">
              تحكم كامل في الخدمات والمنتجات، باقات الاشتراكات، مجموعات الخدمات، معرض الصور، روابط السوشيال والتواصل، شروط الاستخدام والخصوصية، ونطاقات التغطية.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              target="_blank"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900/80 px-4 text-xs font-bold text-neutral-200 hover:border-[#cea355]/40 hover:text-white transition-all shadow-sm"
            >
              <ExternalLink className="size-3.5 text-[#cea355]" />
              <span>معاينة الموقع</span>
            </Link>
            <Link
              href="/admin"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-4 text-xs font-bold text-neutral-300 hover:text-white hover:border-neutral-700 transition-all shadow-sm"
            >
              <ArrowLeft className="size-3.5" />
              <span>لوحة المالك</span>
            </Link>
          </div>
        </header>

        {/* Navigation Tabs - Wrapped so all tabs are always visible and clickable */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 border-b border-neutral-800/80 pb-4">
          {/* Tab 0: Services */}
          <button
            type="button"
            onClick={() => setActiveTab('services')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black transition-all shrink-0 cursor-pointer ${
              activeTab === 'services'
                ? 'gold-gradient text-black shadow-lg shadow-[#cea355]/20'
                : 'bg-[#121212] text-neutral-300 hover:text-white hover:bg-[#1a1a1a] border border-neutral-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>الخدمات والمنتجات</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] ${
                activeTab === 'services' ? 'bg-black/30 text-black font-black' : 'bg-[#1a1a1a] text-[#edce8b]'
              }`}
            >
              {fullServices.length}
            </span>
          </button>

          {/* Tab 1: Subscriptions */}
          <button
            type="button"
            onClick={() => setActiveTab('subscriptions')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black transition-all shrink-0 cursor-pointer ${
              activeTab === 'subscriptions'
                ? 'gold-gradient text-black shadow-lg shadow-[#cea355]/20'
                : 'bg-[#121212] text-neutral-300 hover:text-white hover:bg-[#1a1a1a] border border-neutral-800'
            }`}
          >
            <Repeat className="w-4 h-4" />
            <span>باقات الاشتراكات</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] ${
                activeTab === 'subscriptions' ? 'bg-black/30 text-black font-black' : 'bg-[#1a1a1a] text-[#edce8b]'
              }`}
            >
              {plans.length}
            </span>
          </button>

          {/* Tab 2: Collections */}
          <button
            type="button"
            onClick={() => setActiveTab('collections')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black transition-all shrink-0 cursor-pointer ${
              activeTab === 'collections'
                ? 'gold-gradient text-black shadow-lg shadow-[#cea355]/20'
                : 'bg-[#121212] text-neutral-300 hover:text-white hover:bg-[#1a1a1a] border border-neutral-800'
            }`}
          >
            <PackageCheck className="w-4 h-4" />
            <span>مجموعات الخدمات (Collections)</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] ${
                activeTab === 'collections' ? 'bg-black/30 text-black font-black' : 'bg-[#1a1a1a] text-[#edce8b]'
              }`}
            >
              {initialCollections.length}
            </span>
          </button>

          {/* Tab 3: Gallery */}
          <button
            type="button"
            onClick={() => setActiveTab('gallery')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black transition-all shrink-0 cursor-pointer ${
              activeTab === 'gallery'
                ? 'gold-gradient text-black shadow-lg shadow-[#cea355]/20'
                : 'bg-[#121212] text-neutral-300 hover:text-white hover:bg-[#1a1a1a] border border-neutral-800'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>معرض الصور (Gallery)</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] ${
                activeTab === 'gallery' ? 'bg-black/30 text-black font-black' : 'bg-[#1a1a1a] text-[#edce8b]'
              }`}
            >
              {initialGallery.length}
            </span>
          </button>

          {/* Tab 4: Social & Contact */}
          <button
            type="button"
            onClick={() => setActiveTab('social')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black transition-all shrink-0 cursor-pointer ${
              activeTab === 'social'
                ? 'gold-gradient text-black shadow-lg shadow-[#cea355]/20'
                : 'bg-[#121212] text-neutral-300 hover:text-white hover:bg-[#1a1a1a] border border-neutral-800'
            }`}
          >
            <Share2 className="w-4 h-4" />
            <span>روابط السوشيال والتواصل</span>
          </button>

          {/* Tab 5: Policies */}
          <button
            type="button"
            onClick={() => setActiveTab('policies')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black transition-all shrink-0 cursor-pointer ${
              activeTab === 'policies'
                ? 'gold-gradient text-black shadow-lg shadow-[#cea355]/20'
                : 'bg-[#121212] text-neutral-300 hover:text-white hover:bg-[#1a1a1a] border border-neutral-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>السياسات والشروط (Policies)</span>
          </button>

          {/* Tab 6: Zones */}
          <button
            type="button"
            onClick={() => setActiveTab('zones')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black transition-all shrink-0 cursor-pointer ${
              activeTab === 'zones'
                ? 'gold-gradient text-black shadow-lg shadow-[#cea355]/20'
                : 'bg-[#121212] text-neutral-300 hover:text-white hover:bg-[#1a1a1a] border border-neutral-800'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>نطاقات التغطية والكمبوندات</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] ${
                activeTab === 'zones' ? 'bg-black/30 text-black font-black' : 'bg-[#1a1a1a] text-[#edce8b]'
              }`}
            >
              {initialZones.length}
            </span>
          </button>

          {/* Tab: FAQs */}
          <button
            type="button"
            onClick={() => setActiveTab('faqs')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black transition-all shrink-0 cursor-pointer ${
              activeTab === 'faqs'
                ? 'gold-gradient text-black shadow-lg shadow-[#cea355]/20'
                : 'bg-[#121212] text-neutral-300 hover:text-white hover:bg-[#1a1a1a] border border-neutral-800'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>الأسئلة الشائعة (FAQ)</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] ${
                activeTab === 'faqs' ? 'bg-black/30 text-black font-black' : 'bg-[#1a1a1a] text-[#edce8b]'
              }`}
            >
              {initialFaqs.length}
            </span>
          </button>
        </div>

        {/* Tab 0: Services Manager */}
        {activeTab === 'services' && (
          <ServicesManager
            services={fullServices}
            branches={branches.map((b) => ({ id: b.id, nameAr: b.nameAr }))}
            materials={materials}
            initialServiceId={initialServiceId}
            isNew={isNewService}
          />
        )}

        {/* Tab 1: Subscriptions Manager */}
        {activeTab === 'subscriptions' && (
          <SubscriptionsManager
            plans={plans}
            services={subscriptionServices}
            branches={subscriptionBranches}
          />
        )}

        {/* Tab 2: Collections Manager */}
        {activeTab === 'collections' && (
          <CollectionsManager
            initialCollections={initialCollections}
            availableServices={availableServices}
          />
        )}

        {/* Tab 3: Gallery Manager */}
        {activeTab === 'gallery' && (
          <GalleryManager initialGallery={initialGallery} />
        )}

        {/* Tab 4: Social & Contact Manager */}
        {activeTab === 'social' && (
          <SocialContactManager
            initialSocialLinks={initialSocialLinks}
            activeBranch={activeBranch}
          />
        )}

        {/* Tab 5: Policies Manager */}
        {activeTab === 'policies' && (
          <PoliciesManager initialPolicies={initialPolicies} />
        )}

        {/* Tab 6: Zones & Coverage Manager */}
        {activeTab === 'zones' && (
          <ZonesCoverageManager
            initialZones={initialZones}
            defaultBranchId={defaultBranchId}
            branches={branches}
          />
        )}

        {/* Tab 7: FAQs */}
        {activeTab === 'faqs' && (
          <SiteContentManager
            initialContent={initialContent}
            initialFaqs={initialFaqs}
            defaultSection="faqs"
          />
        )}
      </div>
    </main>
  );
}
