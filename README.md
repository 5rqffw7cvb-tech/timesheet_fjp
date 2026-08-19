# Timesheet — Yokogawa Rep Portal

Web app thay cho quy trình gửi file Excel 週報 cho từng member mỗi tháng.

Member đăng nhập, nhập giờ trực tiếp trên web, nhìn thấy budget của chính mình.
Quản lý theo dõi tiến độ cả team trên một màn hình, duyệt và chốt sổ, rồi bấm một
nút để xuất ra đúng file `週報_FPTジャパン_〇〇_〇〇〇〇年〇〇月.xlsx` gửi khách hàng.

---

## Nó giải quyết đúng những gì

| Việc đang mất thời gian | Cách app xử lý |
|---|---|
| Gửi link OneDrive cho từng member để tránh lộ thông tin cá nhân | Mỗi người đăng nhập chỉ thấy dữ liệu của mình. Không còn chia sẻ file. |
| Mở từng file Excel để confirm số giờ | Một bảng duy nhất: giờ đã nhập, budget, chênh lệch, trạng thái của cả team |
| Member không biết mình còn bao nhiêu giờ | Thanh budget theo từng project, cập nhật ngay khi gõ |
| Ghép số liệu rồi gửi khách | Nút xuất ra file Excel đúng template gốc, hoặc ZIP cho cả team |

---

## Công nghệ

- **Next.js 15** (App Router, Server Actions) + **TypeScript** + **Tailwind CSS 4**
- **PostgreSQL** + **Drizzle ORM**
- Đăng nhập bằng **username + password** (bcrypt), session là JWT trong cookie httpOnly
- Xuất Excel: ghi trực tiếp vào ZIP/XML của template → **giữ nguyên 100% format gốc**

---

## Cài đặt

### 1. Chuẩn bị

```bash
npm install
cp .env.example .env
```

Sửa `.env`:

```env
DATABASE_URL="postgresql://user:pass@host:5432/timesheet?sslmode=require"
AUTH_SECRET="chuỗi ngẫu nhiên ≥32 ký tự"   # tạo bằng: openssl rand -base64 48
SEED_ADMIN_USERNAME="admin"
SEED_ADMIN_PASSWORD="đặt mật khẩu mạnh"
DEFAULT_MEMBER_PASSWORD="mật khẩu mặc định cấp cho member"
```

### 2. Tạo bảng và nạp dữ liệu master

```bash
npm run db:migrate    # tạo schema
npm run db:seed       # nạp 会社名 / 氏名 / 工種 (82 mã) / PJ + tạo tài khoản
```

Script seed in ra bảng username + mật khẩu của toàn bộ tài khoản vừa tạo.
**Lưu lại bảng này để phát cho member** — tất cả đều bị bắt đổi mật khẩu ở lần
đăng nhập đầu tiên.

Chạy lại `db:seed` nhiều lần vẫn an toàn: không ghi đè mật khẩu đã đổi, không
tạo trùng tài khoản.

### 3. Chạy

```bash
npm run dev     # môi trường phát triển
npm run build && npm start   # production
```

---

## Deploy lên cloud (Supabase + Vercel)

1. **Supabase** → tạo project → Settings → Database → copy *Connection string*
   (dùng bản **Session pooler**, port 5432).
2. Ở máy local, đặt `DATABASE_URL` trỏ tới Supabase rồi chạy:
   ```bash
   npm run db:migrate && npm run db:seed
   ```
3. **Vercel** → Import repo → thêm biến môi trường `DATABASE_URL`, `AUTH_SECRET`,
   `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`, `DEFAULT_MEMBER_PASSWORD` → Deploy.
4. Đăng nhập bằng tài khoản admin, đổi mật khẩu, vào **Cấu hình** đặt 所定日数,
   khai báo ngày nghỉ lễ, rồi vào **Budget** set giờ cho từng member.

Muốn tự host thay vì Vercel: `npm run build && npm start` sau một reverse proxy
(nginx/Caddy), Postgres đặt ở đâu cũng được.

---

## Quy trình sử dụng hằng tháng

**Đầu tháng — quản lý**
1. **Cấu hình** → đặt 所定日数 của tháng, thêm ngày nghỉ lễ (公休).
2. **Budget** → set số giờ cho từng member × project. Có nút *Chép từ tháng trước*
   và bấm vào tên cột để điền cùng một giá trị cho cả cột.

**Trong tháng — member**
3. **Nhập timesheet** → chọn ngày ở cột trái → nhập 始業 / 終業 / 休憩, rồi thêm các
   dòng công việc (project × 工種 × số giờ). Tự lưu, không cần bấm Save.
   - *Điền nhanh cả tháng*: điền giờ vào/ra cho mọi ngày T2–T6 còn trống.
   - *Chép ngày trước*: lặp lại y hệt ngày làm việc gần nhất.
   - Thanh budget dưới cùng cho biết còn bao nhiêu giờ theo từng project.

**Cuối tháng**
4. Member bấm **Nộp tháng này** → dữ liệu bị khoá, chuyển sang *Chờ duyệt*.
5. Quản lý vào **Duyệt & chốt sổ** → xem chi tiết từng ngày, đối chiếu 就業時間 với
   tổng giờ chi tiết → **Chốt sổ** hoặc **Trả lại** kèm lý do.
   Có thể tick nhiều người rồi chốt hàng loạt.
6. **Xuất 週報** → *Tải ZIP đã chốt* → gửi khách hàng.

---

## Cách xuất Excel hoạt động

Toàn bộ `月間集計シート` và `勤務報告書` trong template gốc đều là **công thức**
tham chiếu sang 6 sheet tuần. Vì vậy app chỉ cần ghi vào các ô nhập:

| Vị trí | Nội dung |
|---|---|
| `1週!B3, C3` | năm, tháng |
| `1週!C6, C7, D7` | 会社名, 氏名, vai trò |
| `{n}週!I10:U12` | 始業 / 終業 / 休憩 của 7 ngày trong tuần |
| `{n}週!I58:U58` | 勤務欄 (全休, 午前休, 遅刻30分…) |
| `{n}週!B16,D16,E15,E16` + `I15:U16` | 20 dòng công việc × 7 ngày (予定 / 実績) |
| `月間集計シート!I4:I23` | danh sách mã project cần tổng hợp |
| `月間集計シート!X4` | 所定日数 |
| `勤務報告書!U9:U39, F9:F39, N9:N39` | 公休 / 休暇 / 備考 |
| sheet `PJ`, `工種` | đồng bộ master để công thức INDEX-MATCH tra đúng |

Sau khi ghi, app xoá `calcChain.xml` và bật cờ `fullCalcOnLoad` trong
`workbook.xml`, nên **Excel tính lại toàn bộ ngay khi mở file**.

> **Lưu ý:** mở file bằng LibreOffice sẽ thấy `#VALUE!` ở `月間集計シート` cột AI và
> ở `勤務報告書`. Đây là giới hạn của LibreOffice — công thức gốc dùng
> `WEEKDAY("2026/7/1")`, tức ép chuỗi thành ngày, việc mà chỉ Excel làm được.
> File 週報 gốc của khách hàng cũng bị y hệt khi mở bằng LibreOffice.
> **Hãy kiểm tra và gửi file bằng Microsoft Excel.**

### Giới hạn của template
- Mỗi sheet tuần chứa tối đa **20 dòng** công việc (tổ hợp project × 工種 khác nhau
  trong một tuần). Vượt quá, app sẽ báo cảnh báo khi xuất.
- `月間集計シート` tổng hợp tối đa **20 project** một tháng.
- Công thức tra 工種 chỉ dò **82 mã đầu tiên**. Nên sửa mã có sẵn thay vì thêm mới.

---

## Cấu trúc mã nguồn

```
src/
  db/schema.ts               bảng dữ liệu (Drizzle)
  lib/
    auth.ts, jwt.ts          đăng nhập, session, phân quyền
    dates.ts                 tính tuần trong tháng đúng như bố cục sheet 1週~6週
    period.ts                gom dữ liệu một tháng của một member
    adminData.ts             gom dữ liệu cả team cho màn hình quản trị
    excel/
      xlsx.ts                bộ ghi ô ở tầng ZIP/XML, giữ nguyên format
      weeklyReport.ts        bản đồ dữ liệu → ô trong template
      exportData.ts          truy vấn DB rồi dựng file
  actions/                   server actions (auth, timesheet, admin)
  app/
    login, change-password
    (app)/timesheet          màn hình nhập liệu của member
    (app)/summary            tổng hợp tháng của member
    (app)/admin/*            theo dõi, duyệt, budget, xuất, master, cấu hình
    api/export               tải 1 file hoặc ZIP cả team
templates/
  weekly-report-template.xlsx   template gốc đã xoá sạch dữ liệu cá nhân
seed/master.json                master trích từ file 週報 gốc
scripts/
  seed.ts                       nạp master + tạo tài khoản
  clean-template.ts             tạo template sạch từ một file 週報 bất kỳ
```

---

## Bảo mật

- Mật khẩu băm bằng bcrypt (cost 11), không lưu bản rõ ở bất kỳ đâu.
- Session là JWT ký HS256, đặt trong cookie `httpOnly` + `SameSite=Lax`,
  `Secure` khi chạy production. Hết hạn sau 7 ngày.
- Middleware chặn mọi route trừ `/login`; `/admin/*` chỉ dành cho quyền ADMIN.
- API tải file kiểm tra quyền: member chỉ tải được file của chính mình.
- Mọi thao tác quan trọng (đăng nhập, đổi mật khẩu, nộp, duyệt, reset mật khẩu)
  đều ghi vào bảng `audit_logs`.
