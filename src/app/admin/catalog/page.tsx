import { redirect } from 'next/navigation';

interface CatalogPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const sp = searchParams ? await searchParams : {};
  const query = new URLSearchParams();
  query.set('tab', 'services');

  if (typeof sp.serviceId === 'string' && sp.serviceId) {
    query.set('serviceId', sp.serviceId);
  }
  if (sp.new === '1' || sp.new === 'true') {
    query.set('new', '1');
  }

  redirect(`/admin/site?${query.toString()}`);
}
