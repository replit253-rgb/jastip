import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ShiftProvider } from "@/lib/shift";
import { AppLayout } from "@/components/layout";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";

import Login from "@/pages/login";

import AdminDashboard from "@/pages/admin/dashboard";
import AdminPackages from "@/pages/admin/packages";
import AdminPackagesNew from "@/pages/admin/packages-new";
import AdminPackagesType from "@/pages/admin/packages-type";
import AdminPackagesImport from "@/pages/admin/packages-import";
import AdminPackagesDetail from "@/pages/admin/packages-detail";
import AdminBarcode from "@/pages/admin/barcode";
import AdminBarcodeGroupDetail from "@/pages/admin/barcode-group-detail";
import AdminBarcodeBatchDetail from "@/pages/admin/barcode-batch-detail";
import AdminScan from "@/pages/admin/scan";
import AdminVerify from "@/pages/admin/verify";
import VerifyBatchDetail from "@/pages/admin/verify-batch-detail";
import AdminRiwayatPembayaran from "@/pages/admin/riwayat-pembayaran";
import RiwayatPembayaranBatch from "@/pages/admin/riwayat-pembayaran-batch";
import RiwayatPembayaranDetail from "@/pages/admin/riwayat-pembayaran-detail";
import AdminBatches from "@/pages/admin/batches";
import AdminArsip from "@/pages/admin/arsip";
import ArsipBatchDetail from "@/pages/admin/arsip-batch-detail";

import OwnerDashboard from "@/pages/owner/dashboard";
import OwnerPackages from "@/pages/owner/packages";
import OwnerAdmins from "@/pages/owner/admins";
import OwnerReports from "@/pages/owner/reports";
import OwnerUsers from "@/pages/owner/users";
import OwnerFinance from "@/pages/owner/finance";
import OwnerFinanceDetail from "@/pages/owner/finance-detail";
import OwnerFinanceTransactions from "@/pages/owner/finance-transactions";
import OwnerVoids from "@/pages/owner/voids";
import OwnerSettings from "@/pages/owner/settings";
import OwnerPengeluaran from "@/pages/owner/pengeluaran";
import OwnerTarif from "@/pages/owner/tarif";
import ProfilePage from "@/pages/profile";
import AdminShift from "@/pages/admin/shift";
import ShiftHandover from "@/pages/admin/shift-handover";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache stays fresh for 30s — avoids redundant fetches when multiple
      // devices/tabs are open at the same time, and on route navigation.
      staleTime: 30_000,
      // Keep unused queries in cache for 5 minutes
      gcTime: 5 * 60_000,
    },
  },
});

function ProtectedRoute({ component: Component, roles, role, ...rest }: any) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  const allowedRoles: string[] = roles ? roles : role ? [role] : [];

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        setLocation("/login");
      } else if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        setLocation(`/${user.role}/dashboard`);
      }
    }
  }, [user, isLoading, setLocation]);

  if (isLoading || !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-muted/20">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-4xl animate-pulse shadow-lg">
            J
          </div>
          <div className="text-muted-foreground animate-pulse">Memuat data...</div>
        </div>
      </div>
    );
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) return null;

  return (
    <AppLayout>
      <Component {...rest} />
    </AppLayout>
  );
}

function RedirectToDashboard() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        setLocation(`/${user.role}/dashboard`);
      } else {
        setLocation("/login");
      }
    }
  }, [user, isLoading, setLocation]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-muted/20">
      <div className="w-16 h-16 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-4xl animate-pulse shadow-lg">
        J
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RedirectToDashboard} />
      <Route path="/login" component={Login} />

      {/* Admin Routes */}
      <Route path="/admin/dashboard">
        {(params) => <ProtectedRoute role="admin" component={AdminDashboard} params={params} />}
      </Route>
      <Route path="/admin/packages">
        {(params) => <ProtectedRoute role="admin" component={AdminPackages} params={params} />}
      </Route>
      <Route path="/admin/packages/type">
        {(params) => <ProtectedRoute role="admin" component={AdminPackagesType} params={params} />}
      </Route>
      <Route path="/admin/packages/new">
        {(params) => <ProtectedRoute role="admin" component={AdminPackagesNew} params={params} />}
      </Route>
      <Route path="/admin/packages/import">
        {(params) => <ProtectedRoute role="admin" component={AdminPackagesImport} params={params} />}
      </Route>
      <Route path="/admin/batches">
        {(params) => <ProtectedRoute role="admin" component={AdminBatches} params={params} />}
      </Route>
      <Route path="/admin/packages/:id">
        {(params) => <ProtectedRoute role="admin" component={AdminPackagesDetail} params={params} />}
      </Route>
      <Route path="/admin/barcode">
        {(params) => <ProtectedRoute role="admin" component={AdminBarcode} params={params} />}
      </Route>
      <Route path="/admin/barcode/batch/:id">
        {(params) => <ProtectedRoute role="admin" component={AdminBarcodeBatchDetail} params={params} />}
      </Route>
      <Route path="/admin/barcode-group">
        {(params) => <ProtectedRoute role="admin" component={AdminBarcodeGroupDetail} params={params} />}
      </Route>
      <Route path="/admin/scan">
        {(params) => <ProtectedRoute role="admin" component={AdminScan} params={params} />}
      </Route>
      <Route path="/admin/verify">
        {(params) => <ProtectedRoute role="admin" component={AdminVerify} params={params} />}
      </Route>
      <Route path="/admin/verify/batch/:id">
        {(params) => <ProtectedRoute role="admin" component={VerifyBatchDetail} params={params} />}
      </Route>
      <Route path="/admin/riwayat-pembayaran">
        {(params) => <ProtectedRoute role="admin" component={AdminRiwayatPembayaran} params={params} />}
      </Route>
      <Route path="/admin/finance">
        {(params) => <ProtectedRoute role="admin" component={OwnerFinanceTransactions} params={params} />}
      </Route>
      <Route path="/admin/riwayat-pembayaran/batch/:id/detail">
        {(params) => <ProtectedRoute role="admin" component={RiwayatPembayaranDetail} params={params} />}
      </Route>
      <Route path="/admin/riwayat-pembayaran/batch/:id">
        {(params) => <ProtectedRoute role="admin" component={RiwayatPembayaranBatch} params={params} />}
      </Route>
      <Route path="/admin/arsip">
        {(params) => <ProtectedRoute role="admin" component={AdminArsip} params={params} />}
      </Route>
      <Route path="/admin/arsip/batch/:id">
        {(params) => <ProtectedRoute role="admin" component={ArsipBatchDetail} params={params} />}
      </Route>
      <Route path="/admin/settings">
        {(params) => <ProtectedRoute role="owner" component={OwnerSettings} params={params} />}
      </Route>
      <Route path="/admin/shift/handover">
        {(params) => <ProtectedRoute role="admin" component={ShiftHandover} params={params} />}
      </Route>
      <Route path="/admin/shift">
        {(params) => <ProtectedRoute role="admin" component={AdminShift} params={params} />}
      </Route>
      <Route path="/admin/pengeluaran">
        {(params) => <ProtectedRoute role="admin" component={OwnerPengeluaran} params={params} />}
      </Route>
      <Route path="/admin/profile">
        {(params) => <ProtectedRoute role="admin" component={ProfilePage} params={params} />}
      </Route>

      {/* Owner Routes */}
      <Route path="/owner/dashboard">
        {(params) => <ProtectedRoute role="owner" component={OwnerDashboard} params={params} />}
      </Route>
      <Route path="/owner/packages">
        {(params) => <ProtectedRoute role="owner" component={OwnerPackages} params={params} />}
      </Route>
      <Route path="/owner/admins">
        {(params) => <ProtectedRoute role="owner" component={OwnerAdmins} params={params} />}
      </Route>
      <Route path="/owner/reports">
        {(params) => <ProtectedRoute role="owner" component={OwnerReports} params={params} />}
      </Route>
      <Route path="/owner/users">
        {(params) => <ProtectedRoute role="owner" component={OwnerUsers} params={params} />}
      </Route>
      <Route path="/owner/finance/:service">
        {(params) => <ProtectedRoute role="owner" component={OwnerFinanceDetail} params={params} />}
      </Route>
      <Route path="/owner/finance">
        {(params) => <ProtectedRoute role="owner" component={OwnerFinance} params={params} />}
      </Route>
      <Route path="/owner/voids">
        {(params) => <ProtectedRoute role="owner" component={OwnerVoids} params={params} />}
      </Route>
      <Route path="/owner/settings">
        {(params) => <ProtectedRoute role="owner" component={OwnerSettings} params={params} />}
      </Route>
      <Route path="/owner/shift/handover">
        {(params) => <ProtectedRoute role="owner" component={ShiftHandover} params={params} />}
      </Route>
      <Route path="/owner/shift">
        {(params) => <ProtectedRoute role="owner" component={AdminShift} params={params} />}
      </Route>
      <Route path="/owner/pengeluaran">
        {(params) => <ProtectedRoute role="owner" component={OwnerPengeluaran} params={params} />}
      </Route>
      <Route path="/owner/tarif">
        {(params) => <ProtectedRoute role="owner" component={OwnerTarif} params={params} />}
      </Route>
      <Route path="/owner/profile">
        {(params) => <ProtectedRoute role="owner" component={ProfilePage} params={params} />}
      </Route>

      {/* Owner — Admin Tools */}
      <Route path="/owner/batches">
        {(params) => <ProtectedRoute role="owner" component={AdminBatches} params={params} />}
      </Route>
      <Route path="/owner/packages/type">
        {(params) => <ProtectedRoute role="owner" component={AdminPackagesType} params={params} />}
      </Route>
      <Route path="/owner/packages/new">
        {(params) => <ProtectedRoute role="owner" component={AdminPackagesNew} params={params} />}
      </Route>
      <Route path="/owner/packages/import">
        {(params) => <ProtectedRoute role="owner" component={AdminPackagesImport} params={params} />}
      </Route>
      <Route path="/owner/packages/:id">
        {(params) => <ProtectedRoute role="owner" component={AdminPackagesDetail} params={params} />}
      </Route>
      <Route path="/owner/barcode">
        {(params) => <ProtectedRoute role="owner" component={AdminBarcode} params={params} />}
      </Route>
      <Route path="/owner/barcode/batch/:id">
        {(params) => <ProtectedRoute role="owner" component={AdminBarcodeBatchDetail} params={params} />}
      </Route>
      <Route path="/owner/barcode-group">
        {(params) => <ProtectedRoute role="owner" component={AdminBarcodeGroupDetail} params={params} />}
      </Route>
      <Route path="/owner/scan">
        {(params) => <ProtectedRoute role="owner" component={AdminScan} params={params} />}
      </Route>
      <Route path="/owner/verify">
        {(params) => <ProtectedRoute role="owner" component={AdminVerify} params={params} />}
      </Route>
      <Route path="/owner/verify/batch/:id">
        {(params) => <ProtectedRoute role="owner" component={VerifyBatchDetail} params={params} />}
      </Route>
      <Route path="/owner/arsip">
        {(params) => <ProtectedRoute role="owner" component={AdminArsip} params={params} />}
      </Route>
      <Route path="/owner/arsip/batch/:id">
        {(params) => <ProtectedRoute role="owner" component={ArsipBatchDetail} params={params} />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <ShiftProvider>
              <Router />
            </ShiftProvider>
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
