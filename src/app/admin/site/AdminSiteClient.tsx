'use client';

import { useState, useRef, type WheelEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import {
  Layers,
  Repeat,
  PackageCheck,
  ImageIcon,
  Share2,
  ShieldCheck,
  HelpCircle,
  ExternalLink,
  ArrowLeft,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import CollectionsManager from './CollectionsManager';
import GalleryManager from './GalleryManager';
import PoliciesManager from './PoliciesManager';
import SiteContentManager from './SiteContentManager';
import SocialContactManager from './SocialContactManager';
import type { CoverageZoneItem } from './ZonesCoverageManager';
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
  defaultBranchId?: string;
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
  initialGallery,
  initialPolicies,
  initialSocialLinks = DEFAULT_SOCIAL_LINKS,
  branches = [],
  activeBranch,
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
      'faqs',
    ];
    if (initialTab && validTabs.includes(initialTab as TabKey)) {
      return initialTab as TabKey;
    }
    return 'services';
  });

  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);

  function scrollTabs(direction: 'left' | 'right') {
    const el = tabsScrollRef.current;
    if (!el) return;
    const scrollAmount = 300;
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  }

  function handleWheel(e: WheelEvent<HTMLDivElement>) {
    const el = tabsScrollRef.current;
    if (!el) return;
    if (e.deltaY !== 0) {
      el.scrollLeft += e.deltaY;
    }
  }

  function handleMouseDown(e: MouseEvent<HTMLDivElement>) {
    const el = tabsScrollRef.current;
    if (!el) return;
    isDraggingRef.current = true;
    startXRef.current = e.pageX - el.offsetLeft;
    scrollLeftRef.current = el.scrollLeft;
  }

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return;
    const el = tabsScrollRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - startXRef.current) * 1.5;
    el.scrollLeft = scrollLeftRef.current - walk;
  }

  function handleMouseUpOrLeave() {
    isDraggingRef.current = false;
  }

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
              إدارة محتوى الموقع والسياسات
            </h1>
            <p className="max-w-3xl text-xs sm:text-sm text-neutral-400 leading-relaxed">
              تحكم كامل في الخدمات والمنتجات، باقات الاشتراكات، مجموعات الخدمات، معرض الصور، روابط السوشيال والتواصل، شروط الاستخدام والخصوصية، والأسئلة الشائعة.
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

        {/* Horizontal Navigation Tabs with Left/Right Nav Arrows and Smooth Wheel Scroll */}
        <div className="relative border-b border-neutral-800/80 pb-4">
          <div className="flex items-center gap-2">
            {/* Scroll Right Button */}
            <button
              type="button"
              onClick={() => scrollTabs('right')}
              title="تمرير لليمين"
              aria-label="تمرير التبويبات لليمين"
              className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-[#111114] text-neutral-300 transition-all hover:border-[#cea355]/50 hover:text-[#edce8b] hover:bg-[#18181c] active:scale-95 cursor-pointer shadow-md"
            >
              <ChevronRight className="size-4 sm:size-5" />
            </button>

            {/* Scrollable Single-Line Tab Strip */}
            <div
              ref={tabsScrollRef}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUpOrLeave}
              onMouseLeave={handleMouseUpOrLeave}
              className="flex-1 flex items-center gap-2.5 overflow-x-auto scroll-smooth py-1 select-none cursor-grab active:cursor-grabbing [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
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

              {/* Tab 6: FAQs */}
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

            {/* Scroll Left Button */}
            <button
              type="button"
              onClick={() => scrollTabs('left')}
              title="تمرير لليسار"
              aria-label="تمرير التبويبات لليسار"
              className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-[#111114] text-neutral-300 transition-all hover:border-[#cea355]/50 hover:text-[#edce8b] hover:bg-[#18181c] active:scale-95 cursor-pointer shadow-md"
            >
              <ChevronLeft className="size-4 sm:size-5" />
            </button>
          </div>
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

        {/* Tab 6: FAQs */}
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
