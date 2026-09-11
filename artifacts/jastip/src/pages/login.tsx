import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import logoImg from "/logo.png";
import { MapPin, Phone, Mail, CheckCircle } from "lucide-react";

const loginSchema = z.object({
  phone: z.string().min(5, "Nomor HP harus diisi minimal 5 karakter"),
  password: z.string().min(3, "Password harus diisi minimal 3 karakter"),
});

const services = [
  "Jastip Cargo – hemat untuk paket besar",
  "Jastip Hemat+ – lebih cepat, harga tetap terjangkau",
  "Jastip Pelni – pengiriman kapal cepat",
  "Jastip Pesawat – paling cepat",
  "Jasa Belanja – gratis jasa",
];

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    try {
      setIsSubmitting(true);
      await login(values);
      toast({ title: "Login berhasil", description: "Selamat datang kembali" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Login gagal", description: error.message || "Nomor HP atau password salah" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex">
      {/* LEFT — Branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative bg-red-700 flex-col overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-red-600/50" />
        <div className="absolute -bottom-32 -right-32 w-[400px] h-[400px] rounded-full bg-red-800/60" />
        <div className="absolute top-1/2 right-16 w-56 h-56 rounded-full bg-red-500/30" />

        <div className="relative z-10 flex flex-col h-full px-12 py-12">
          <div className="flex items-center gap-4 mb-10">
            <img src={logoImg} alt="Jastip Anggun Jaya" className="h-16 w-auto rounded-xl shadow-2xl" />
            <div>
              <h1 className="text-2xl font-extrabold text-white leading-tight">Jastip Anggun Jaya</h1>
              <p className="text-red-200 text-sm mt-0.5">Aman • Terpercaya • Berpengalaman</p>
            </div>
          </div>

          <div className="mb-8">
            <p className="text-red-100 text-lg font-medium leading-relaxed">
              Layanan pengiriman paket & kendaraan ke Papua
            </p>
            <p className="text-red-200 text-base mt-1 font-medium">
              Jakarta • Surabaya • Makassar → <span className="text-white font-bold">Manokwari</span>
            </p>
          </div>

          <div className="mb-10 flex-1">
            <p className="text-red-200 text-xs font-semibold uppercase tracking-widest mb-4">Layanan Kami</p>
            <div className="space-y-3">
              {services.map((s, i) => (
                <div key={i} className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                  <span className="text-white text-sm leading-snug">{s}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-red-600/60 pt-6 space-y-2">
            <div className="flex items-center gap-2.5 text-red-100 text-sm">
              <MapPin className="w-4 h-4 text-red-300 shrink-0" />
              <span>Jln Merpati Sp 4 jlr 8 (Depan SMKN 4), Manokwari</span>
            </div>
            <div className="flex items-center gap-2.5 text-red-100 text-sm">
              <Phone className="w-4 h-4 text-red-300 shrink-0" />
              <span>+62 812-4500-8384</span>
            </div>
            <div className="flex items-center gap-2.5 text-red-100 text-sm">
              <Mail className="w-4 h-4 text-red-300 shrink-0" />
              <span>jastipanggunjaya@gmail.com</span>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT — Login Form */}
      <div className="w-full lg:w-1/2 xl:w-2/5 flex flex-col items-center justify-center bg-white px-6 py-12 overflow-y-auto">
        <div className="flex flex-col items-center mb-6 lg:hidden">
          <img src={logoImg} alt="Jastip Anggun Jaya" className="h-20 w-auto mb-2 rounded-xl" />
          <p className="text-base font-bold text-gray-900">Jastip Anggun Jaya</p>
          <p className="text-xs text-muted-foreground">Layanan pengiriman paket ke Papua</p>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-7">
            <h2 className="text-3xl font-bold text-gray-900">Selamat Datang</h2>
            <p className="text-muted-foreground mt-1 text-sm">Masuk ke akun Anda untuk melanjutkan</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700 font-medium">Nomor HP</FormLabel>
                    <FormControl>
                      <Input placeholder="0812xxxx" className="h-11" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700 font-medium">Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" className="h-11" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full h-11 bg-red-600 hover:bg-red-700 text-white font-semibold text-base shadow-md" disabled={isSubmitting}>
                {isSubmitting ? "Memproses..." : "Masuk"}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
