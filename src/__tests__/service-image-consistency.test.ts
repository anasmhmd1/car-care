import { describe, expect, it } from 'vitest';
import { BRAND_LOGO, getServiceGalleryImages, getServiceRealImage } from '@/lib/service-images';

describe('Service Image Consistency (صور الخدمات الحقيقية وشعار البراند الرسمي)', () => {
  it('defaults to official brand logo when no custom photo is uploaded', () => {
    const exteriorReal = getServiceRealImage('bareeq-essential-exterior', '/images/services/exterior-care.svg');
    expect(exteriorReal).toBe(BRAND_LOGO);

    const noCoverReal = getServiceRealImage('bareeq-intensive-interior', null);
    expect(noCoverReal).toBe(BRAND_LOGO);

    const emptyCoverReal = getServiceRealImage('bareeq-engine-bay-care', '');
    expect(emptyCoverReal).toBe(BRAND_LOGO);
  });

  it('preserves custom uploaded photos and HTTPS media uploaded by the Owner', () => {
    const customUpload = '/api/catalog-media/service-custom-image-123.jpg';
    const resolved = getServiceRealImage('bareeq-essential-exterior', customUpload);
    expect(resolved).toBe(customUpload);

    const httpsImage = 'https://images.unsplash.com/photo-car-wash-123.jpg';
    const resolvedHttps = getServiceRealImage('bareeq-essential-exterior', httpsImage);
    expect(resolvedHttps).toBe(httpsImage);
  });

  it('returns only the uploaded photo in gallery without injecting random cars', () => {
    const customUpload = '/api/catalog-media/custom-cover.webp';
    const gallery = getServiceGalleryImages('bareeq-essential-exterior', customUpload, []);

    // Should ONLY contain the uploaded cover, exactly 1 image
    expect(gallery).toEqual([customUpload]);
  });

  it('returns uploaded cover and uploaded gallery without fake fallback cars', () => {
    const customUpload = '/api/catalog-media/custom-cover.webp';
    const customSlide = '/api/catalog-media/custom-slide.webp';
    const gallery = getServiceGalleryImages('bareeq-essential-exterior', customUpload, [customSlide]);

    expect(gallery).toEqual([customUpload, customSlide]);
  });

  it('defaults gallery to brand logo if no custom photos exist', () => {
    const gallery = getServiceGalleryImages('bareeq-essential-exterior', null, []);
    expect(gallery).toEqual([BRAND_LOGO]);
  });
});
