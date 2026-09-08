import { useAuth } from "@/lib/auth";
import { useShift } from "@/lib/shift";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import logoImg from "/logo.png";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  LogOut,
  Package,
  LayoutDashboard,
  ScanLine,
  Users,
  FileText,
  Settings,
  UserPlus,
  Barcode,
  FileSpreadsheet,
  FileInput,
  TrendingUp,
  Crown,
  Wrench,
  UserCircle,
  ShieldCheck,
  History,
  Ship,
  Archive,
  TrendingDown,
  Tag,
  WalletCards,
} from "lucide-react";

type NavItem = { name: string; href: string; icon: any; exact?: boolean; requiresShift?: boolean };
type NavSection = { label: string; items: NavItem[] };

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { shift } = useShift();
  const [location] = useLocation();

  if (!user) return <>{children}</>;

  const role = user.role;

  const adminNav: NavItem[] = [
    { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard, exact: true },
    { name: "Semua Paket", href: "/admin/packages", icon: Package },
    { name: "Batch Pengiriman", href: "/admin/batches", icon: Ship, exact: true },
    { name: "Input Paket", href: "/admin/packages/type", icon: FileInput, exact: true },
    { name: "Import Excel", href: "/admin/packages/import", icon: FileSpreadsheet, exact: true },
    { name: "Label Barcode", href: "/admin/barcode", icon: Barcode, exact: true },
    { name: "Arsip Sudah Diambil", href: "/admin/arsip", icon: Archive, exact: true },
    { name: "Scan Barcode dan Pembayaran", href: "/admin/scan", icon: ScanLine, exact: true, requiresShift: true },
    { name: "Verifikasi Paket", href: "/admin/verify", icon: ShieldCheck, exact: true },
    { name: "Riwayat Pembayaran", href: "/admin/riwayat-pembayaran", icon: History, exact: true },
    { name: "Shift Kasir", href: "/admin/shift", icon: WalletCards, exact: true },
    { name: "Profil", href: "/admin/profile", icon: UserCircle, exact: true },
  ];

  const ownerSections: NavSection[] = [
    {
      label: "Owner",
      items: [
        { name: "Dashboard", href: "/owner/dashboard", icon: LayoutDashboard, exact: true },
        { name: "Monitor Paket", href: "/owner/packages", icon: Package },
        { name: "Data Admin", href: "/owner/admins", icon: UserPlus, exact: true },
        { name: "Keuangan", href: "/owner/finance", icon: TrendingUp, exact: true },
        { name: "Pengeluaran Harian", href: "/owner/pengeluaran", icon: TrendingDown, exact: true },
        { name: "Laporan", href: "/owner/reports", icon: FileText, exact: true },
        { name: "Pengaturan Tarif", href: "/owner/tarif", icon: Tag, exact: true },
        { name: "Manajemen User", href: "/owner/users", icon: Settings, exact: true },
        { name: "Profil", href: "/owner/profile", icon: UserCircle, exact: true },
      ],
    },
    {
      label: "Admin Tools",
      items: [
        { name: "Batch Pengiriman", href: "/owner/batches", icon: Ship, exact: true },
        { name: "Input Paket", href: "/owner/packages/type", icon: FileInput, exact: true },
        { name: "Import Excel", href: "/owner/packages/import", icon: FileSpreadsheet, exact: true },
        { name: "Label Barcode", href: "/owner/barcode", icon: Barcode, exact: true },
        { name: "Arsip Sudah Diambil", href: "/owner/arsip", icon: Archive, exact: true },
        { name: "Scan Barcode dan Pembayaran", href: "/owner/scan", icon: ScanLine, exact: true, requiresShift: true },
        { name: "Verifikasi Paket", href: "/owner/verify", icon: ShieldCheck, exact: true },
      ],
    },
  ];

  const isOwner = role === "owner";
  const shiftHref = isOwner ? "/owner/shift" : "/admin/shift";
  const visibleAdminNav = adminNav.filter((item) => !item.requiresShift || shift);
  const visibleOwnerSections = ownerSections.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.requiresShift || shift),
  }));

  function isActive(item: NavItem) {
    if (location === item.href) return true;
    if (item.exact) return false;
    if (!location.startsWith(item.href + "/")) return false;
    const sub = location.slice(item.href.length + 1);
    return /^\d+$/.test(sub);
  }

  function renderNavItem(item: NavItem) {
    const active = isActive(item);
    return (
      <SidebarMenuItem key={item.href}>
        <SidebarMenuButton asChild isActive={active} tooltip={item.name}>
          <Link href={item.href} className="flex items-center gap-3 w-full">
            <item.icon className="w-5 h-5" />
            <span>{item.name}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-muted/20">
        <Sidebar className="border-r bg-sidebar">
          <SidebarHeader className="p-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <img src={logoImg} alt="Jastip Anggun Jaya" className="h-10 w-auto rounded" />
              <div className="flex flex-col">
                <span className="font-bold tracking-tight text-primary leading-tight">JASTIP</span>
                <span className="text-xs text-muted-foreground font-semibold leading-none">ANGGUN JAYA</span>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent className="p-2">
            {isOwner ? (
               visibleOwnerSections.map((section, idx) => (
                <div key={section.label} className="mb-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 mb-1">
                    {section.label === "Owner" ? (
                      <Crown className="w-3 h-3 text-amber-500" />
                    ) : (
                      <Wrench className="w-3 h-3 text-blue-500" />
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {section.label}
                    </span>
                  </div>
                  <SidebarMenu>{section.items.map(renderNavItem)}</SidebarMenu>
                  {idx < ownerSections.length - 1 && (
                    <div className="mx-3 mt-3 border-t border-border/40" />
                  )}
                </div>
              ))
            ) : (
               <SidebarMenu>{visibleAdminNav.map(renderNavItem)}</SidebarMenu>
            )}
          </SidebarContent>
          <SidebarFooter className="p-4 border-t border-border/50">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col">
                <span className="font-medium text-sm">{user.name}</span>
                <span className="text-xs text-muted-foreground capitalize">{user.role}</span>
              </div>
              <Button variant="outline" className="w-full justify-start text-destructive" onClick={() => logout()}>
                <LogOut className="w-4 h-4 mr-2" />
                Keluar
              </Button>
            </div>
          </SidebarFooter>
        </Sidebar>
        <div className="flex-1 flex flex-col w-full overflow-hidden">
          <header className="h-14 border-b bg-background flex items-center px-4 md:px-6 sticky top-0 z-10">
            <SidebarTrigger className="mr-4 md:hidden" />
            <div className="flex-1" />
            <Link href={shiftHref} className={`mr-4 hidden rounded-full px-3 py-1.5 text-xs font-semibold sm:block ${shift ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
              {user.name} • {shift ? `Shift ${shift.shiftType === "PAGI" ? "Pagi" : "Malam"} • Aktif` : "Shift belum dibuka"}
            </Link>
            <div className="text-sm font-medium text-muted-foreground hidden sm:block">
              {new Date().toLocaleDateString("id-ID", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
            <div className="text-xs font-medium text-muted-foreground sm:hidden">
              {new Date().toLocaleDateString("id-ID", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </div>
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-6xl w-full">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
