import { describe, expect, it } from 'vitest';
import { getServiceGalleryImages, getServiceRealImage } from '@/lib/service-images';

describe('Service Image Consistency (تطابق وتوحيد صور الخدمات بين الكتالوج والصفحة الداخلية)', () => {
  it('maps SVG and generic placeholder cover images to high quality realistic photos', () => {
    const exteriorReal = getServiceRealImage('bareeq-essential-exterior', '/images/services/exterior-care.svg');
    expect(exteriorReal).toBe('/images/bareeq_exterior_care.png');

    const interiorReal = getServiceRealImage('bareeq-intensive-interior', '/images/services/interior-care.svg');
    expect(interiorReal).toBe('/images/bareeq_interior_care.png');

    const engineReal = getServiceRealImage('bareeq-engine-bay-care', '/images/services/engine-care.svg');
    expect(engineReal).toBe('/images/bareeq_engine_care.png');

    const fullCareReal = getServiceRealImage('bareeq-complete-full-care', '/images/services/complete-care.svg');
    expect(fullCareReal).toBe('/images/bareeq_hero_car.png');
  });

  it('preserves custom uploaded photos and HTTPS media uploaded by the Owner', () => {
    const customUpload = '/api/catalog-media/service-custom-image-123.jpg';
    const resolved = getServiceRealImage('bareeq-essential-exterior', customUpload);
    expect(resolved).toBe(customUpload);

    const httpsImage = 'https://images.unsplash.com/photo-car-wash-123.jpg';
    const resolvedHttps = getServiceRealImage('bareeq-essential-exterior', httpsImage);
    expect(resolvedHttps).toBe(httpsImage);
  });

  it('generates consistent realistic gallery images without SVG placeholders', () => {
    const gallery = getServiceGalleryImages('bareeq-essential-exterior', '/images/services/exterior-care.svg', [
      '/images/services/exterior-care.svg',
      '/images/services/complete-care.svg',
    ]);

    expect(gallery.length).toBeGreaterThanOrEqual(2);
    for (const img of gallery) {
      expect(img.endsWith('.svg')).toBe(false);
      expect(img.startsWith('/images/')).toBe(true);
    }
  });
});
