import { describe, expect, it } from 'vitest';
import { BRAND_LOGO, getServiceGalleryImages, getServiceRealImage } from '@/lib/service-images';

describe('Service Image Consistency (صور الخدمات — تطابق بين لوحة الأونر وواجهة العميل)', () => {
  it('shows SVG service illustrations exactly as stored — same as admin sees', () => {
    const exteriorReal = getServiceRealImage('bareeq-essential-exterior', '/images/services/exterior-care.svg');
    expect(exteriorReal).toBe('/images/services/exterior-care.svg');

    const completeReal = getServiceRealImage('bareeq-complete-care', '/images/services/complete-care.svg');
    expect(completeReal).toBe('/images/services/complete-care.svg');
  });

  it('defaults to official brand logo when NO image exists at all', () => {
    expect(getServiceRealImage('test', null)).toBe(BRAND_LOGO);
    expect(getServiceRealImage('test', '')).toBe(BRAND_LOGO);
    expect(getServiceRealImage('test', undefined)).toBe(BRAND_LOGO);
  });

  it('preserves custom uploaded photos and HTTPS media uploaded by the Owner', () => {
    const customUpload = '/api/catalog-media/service-custom-image-123.jpg';
    expect(getServiceRealImage('test', customUpload)).toBe(customUpload);

    const httpsImage = 'https://images.unsplash.com/photo-car-wash-123.jpg';
    expect(getServiceRealImage('test', httpsImage)).toBe(httpsImage);
  });

  it('returns cover + gallery images as stored without injecting random cars', () => {
    const gallery = getServiceGalleryImages(
      'bareeq-complete-care',
      '/images/services/complete-care.svg',
      ['/images/services/exterior-care.svg', '/images/services/interior-care.svg'],
    );
    expect(gallery).toEqual([
      '/images/services/complete-care.svg',
      '/images/services/exterior-care.svg',
      '/images/services/interior-care.svg',
    ]);
  });

  it('never auto-injects old fallback car images into galleries', () => {
    const gallery = getServiceGalleryImages(
      'bareeq-essential-exterior',
      '/api/catalog-media/custom.webp',
      ['/images/bareeq_hero_car.png', '/images/bareeq_reference_hero.png'],
    );
    // The injected fallback cars must be filtered out
    expect(gallery).toEqual(['/api/catalog-media/custom.webp']);
    expect(gallery).not.toContain('/images/bareeq_hero_car.png');
    expect(gallery).not.toContain('/images/bareeq_reference_hero.png');
  });

  it('defaults gallery to brand logo if no images exist', () => {
    expect(getServiceGalleryImages('test', null, [])).toEqual([BRAND_LOGO]);
    expect(getServiceGalleryImages('test', null, null)).toEqual([BRAND_LOGO]);
  });
});
