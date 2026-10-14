

---

## 9. Catatan Risiko & Catatan Audit Diketahui (Known Risks)
- **Atribusi Pengeluaran Kas Operasional**: Saat ini pencatatan pengeluaran operasional dikaitkan ke shift kasir semata-mata berdasarkan rentang waktu timestamp (`createdAt` di antara `actualStart` dan `actualEnd` shift), bukan relasi langsung ID shift (`shiftSessionId`) atau admin pencatat. Hal ini dicatat sebagai risiko yang diketahui (*known risk*) untuk dianalisis lebih lanjut setelah data produksi (*production CSV export*) dievaluasi secara menyeluruh.
