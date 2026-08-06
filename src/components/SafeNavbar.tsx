import Navbar from '@/components/Navbar';

interface SafeNavbarProps {
  user?: {
    id: string;
    fullName: string;
    role: string;
  } | null;
}

/** Server boundary that ensures the Client Navbar receives only what it renders. */
export default function SafeNavbar({ user }: SafeNavbarProps) {
  const clientUser = user
    ? { id: user.id, fullName: user.fullName, role: user.role }
    : null;

  return <Navbar user={clientUser} />;
}
