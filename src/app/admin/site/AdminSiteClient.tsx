'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Layers,
  FileText,
  HelpCircle,
  ExternalLink,
  ArrowRight,
  Compass,
  Images,
  FileCheck2,
  Share2,
} from 'lucide-react';
import CollectionsManager from './CollectionsManager';
import GalleryManager from './GalleryManager';
import PoliciesManager from './PoliciesManager';
import SiteContentManager from './SiteContentManager';
import SocialContactManager from './SocialContactManager';
import ZonesCoverageManager, { type CoverageZoneItem } from './ZonesCoverageManager';
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

interface AdminSiteClientProps {
  initialCollections: ServiceCollection[];
  availableServices: ServiceOption[];
  initialContent: HomepageContent;
  initialFaqs: FaqItem[];
  initialZones: CoverageZoneItem[];
  initialGallery: GalleryItem[];
  initialPolicies: PoliciesContent;
  initialSocialLinks?: SocialLinks;
  branches?: BranchContactDto[];
  activeBranch?: BranchContactDto | null;
  defaultBranchId: string;
}

export default function AdminSiteClient({
  initialCollections,
  availableServices,
  initialContent,
  initialFaqs,
  initialZones,
  initialGallery,
  initialPolicies,
  initialSocialLinks = DEFAULT_SOCIAL_LINKS,
  branches = [],
  activeBranch,
  defaultBranchId,
}: AdminSiteClientProps) {
  const [activeTab, setActiveTab] = useState<
    'collections' | 'gallery' | 'policies' | 'social' | 'zones' | 'content' | 'faqs'
  >('collections');

  return (
    <main className="min-h-screen bg-[#050505] px-4 py-10 text-white sm:px-6 lg:px-8 font-sans selection:bg-[#cea355] selection:text-black" dir="rtl">
      <div className="mx-auto max-w-6xl space-y-8">
        
        {/* Header */}
        <header className="flex flex-col gap-5 border-b border-neutral-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#edce8b]">
              <FileText className="w-4 h-4 text-[#cea355]" aria-hidden="true" />
              <span>إدارة واجهة وهوية المنصة</span>
            </div>
            <h1 className="mt-2 text-3xl font-black text-white">إدارة محتوى الموقع والتغطية والسياسات</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-300">
              تحكم كامل في مجموعات الخدمات، معرض الصور، روابط السوشيال والتواصل، شروط الاستخدام والخصوصية، ونطاقات التغطية.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              target="_blank"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#cea355]/40 bg-[#cea355]/10 px-4 text-xs font-bold text-[#edce8b] hover:bg-[#cea355]/20 transition-all"
            >
              <ExternalLink className="w-4 h-4" />
              <span>معاينة الموقع</span>
            </Link>
            <Link
              href="/admin"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-800 bg-[#121212] px-4 text-xs font-bold text-neutral-300 hover:text-white hover:border-neutral-700 transition-all"
            >
              <ArrowRight className="w-4 h-4" />
              <span>لوحة المالك</span>
            </Link>
          </div>
        </header>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-neutral-800/80 pb-3 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('collections')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black transition-all shrink-0 cursor-pointer ${
              activeTab === 'collections'
                ? 'gold-gradient text-white shadow-lg shadow-[#cea355]/20'
                : 'bg-[#121212] text-neutral-300 hover:text-white hover:bg-[#1a1a1a] border border-neutral-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>مجموعات العناية (الكوليكشن)</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${
              activeTab === 'collections' ? 'bg-black/30 text-white' : 'bg-[#1a1a1a] text-[#edce8b]'
            }`}>
              {initialCollections.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('gallery')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black transition-all shrink-0 cursor-pointer ${
              activeTab === 'gallery'
                ? 'gold-gradient text-white shadow-lg shadow-[#cea355]/20'
                : 'bg-[#121212] text-neutral-300 hover:text-white hover:bg-[#1a1a1a] border border-neutral-800'
            }`}
          >
            <Images className="w-4 h-4" />
            <span>معرض الصور (Gallery)</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${
              activeTab === 'gallery' ? 'bg-black/30 text-white' : 'bg-[#1a1a1a] text-[#edce8b]'
            }`}>
              {initialGallery.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('social')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black transition-all shrink-0 cursor-pointer ${
              activeTab === 'social'
                ? 'gold-gradient text-white shadow-lg shadow-[#cea355]/20'
                : 'bg-[#121212] text-neutral-300 hover:text-white hover:bg-[#1a1a1a] border border-neutral-800'
            }`}
          >
            <Share2 className="w-4 h-4" />
            <span>روابط السوشيال والتواصل</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('policies')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black transition-all shrink-0 cursor-pointer ${
              activeTab === 'policies'
                ? 'gold-gradient text-white shadow-lg shadow-[#cea355]/20'
                : 'bg-[#121212] text-neutral-300 hover:text-white hover:bg-[#1a1a1a] border border-neutral-800'
            }`}
          >
            <FileCheck2 className="w-4 h-4" />
            <span>السياسات والشروط (Policies)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('zones')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black transition-all shrink-0 cursor-pointer ${
              activeTab === 'zones'
                ? 'gold-gradient text-white shadow-lg shadow-[#cea355]/20'
                : 'bg-[#121212] text-neutral-300 hover:text-white hover:bg-[#1a1a1a] border border-neutral-800'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>نطاقات التغطية والكمبوندات</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${
              activeTab === 'zones' ? 'bg-black/30 text-white' : 'bg-[#1a1a1a] text-[#edce8b]'
            }`}>
              {initialZones.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('content')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black transition-all shrink-0 cursor-pointer ${
              activeTab === 'content'
                ? 'gold-gradient text-white shadow-lg shadow-[#cea355]/20'
                : 'bg-[#121212] text-neutral-300 hover:text-white hover:bg-[#1a1a1a] border border-neutral-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>نصوص الصفحة الرئيسية</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('faqs')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black transition-all shrink-0 cursor-pointer ${
              activeTab === 'faqs'
                ? 'gold-gradient text-white shadow-lg shadow-[#cea355]/20'
                : 'bg-[#121212] text-neutral-300 hover:text-white hover:bg-[#1a1a1a] border border-neutral-800'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>الأسئلة الشائعة (FAQ)</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${
              activeTab === 'faqs' ? 'bg-black/30 text-white' : 'bg-[#1a1a1a] text-[#edce8b]'
            }`}>
              {initialFaqs.length}
            </span>
          </button>
        </div>

        {/* Tab 1: Collections Manager */}
        {activeTab === 'collections' && (
          <CollectionsManager
            initialCollections={initialCollections}
            availableServices={availableServices}
          />
        )}

        {/* Tab 2: Gallery Manager */}
        {activeTab === 'gallery' && (
          <GalleryManager
            initialGallery={initialGallery}
          />
        )}

        {/* Tab 3: Social & Contact Manager */}
        {activeTab === 'social' && (
          <SocialContactManager
            initialSocialLinks={initialSocialLinks}
            activeBranch={activeBranch}
          />
        )}

        {/* Tab 4: Policies Manager */}
        {activeTab === 'policies' && (
          <PoliciesManager
            initialPolicies={initialPolicies}
          />
        )}

        {/* Tab 5: Zones & Coverage Manager */}
        {activeTab === 'zones' && (
          <ZonesCoverageManager
            initialZones={initialZones}
            defaultBranchId={defaultBranchId}
            branches={branches}
          />
        )}

        {/* Tab 6 & 7: Content & FAQs */}
        {(activeTab === 'content' || activeTab === 'faqs') && (
          <SiteContentManager
            initialContent={initialContent}
            initialFaqs={initialFaqs}
            defaultSection={activeTab}
          />
        )}

      </div>
    </main>
  );
}
