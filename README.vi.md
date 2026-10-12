# Công việc — ứng dụng kiểu desktop chạy trong Cogover

[English](README.md) · **Tiếng Việt**

Ứng dụng một trang (SPA) chạy trong Workspace [Cogover](https://cogover.com) dưới dạng **Custom Frontend Module**. Giao diện giống một desktop nhỏ: dock bên trái, mỗi app mở trong một cửa sổ riêng.

| App | Chức năng |
| --- | --- |
| **Công việc** | Việc của tôi: bộ lọc nhanh, lọc theo hạn chót / vai trò / mức ưu tiên, lọc theo người, tìm kiếm, quy trình trạng thái, mô tả rich text có dán ảnh, file đính kèm, dòng hoạt động với ghi chú và @mention, chọn cột và kéo đổi độ rộng cột. |
| **Ghi chú** | Ghi chú cá nhân theo thư mục: rich text, Markdown hoặc văn bản thuần, thẻ, ghim, chia sẻ. |
| **Dev tools** | Định dạng JSON, xem trước Markdown, giải mã / tạo JWT, mã hoá / giải mã Base64. Chạy hoàn toàn trong trình duyệt, không gửi dữ liệu đi đâu. |
| **Cài đặt** | Thiết lập cá nhân (ảnh nền desktop). |

Giao diện bằng tiếng Việt, và mọi ngày giờ đều tính theo giờ Việt Nam (UTC+7), bất kể múi giờ của trình duyệt.

## Chạy thử trên máy (không cần tài khoản Cogover)

Server dev trả lời các API của Cogover bằng backend giả lập có sẵn, với dữ liệu hư cấu.

```bash
cd app
npm install
npm run dev
```

Sau đó mở <http://localhost:5317>. Muốn khôi phục dữ liệu giả lập thì mở <http://localhost:5317/__mock/reset> (trang trả về trống) rồi tải lại ứng dụng.

Yêu cầu: Node.js 22.22 trở lên (hoặc 24.15+); bộ công cụ test không chạy trên Node 20.

## Cấu trúc thư mục

```
app/                  Vite + React 19 + TypeScript
  src/                app Công việc (gốc), và:
    notes/            app Ghi chú
    devtools/         app Dev tools
    settings/         app Cài đặt
    desktop/          dock, cửa sổ, xử lý URL
    components/ui/    component shadcn/ui (Radix)
    workspaces.ts     ID Object / field của Workspace đang phục vụ trang
  dev/                backend giả lập cho `npm run dev` và unit test
e2e/                  test end-to-end bằng Playwright (API giả lập)
objects/              các Object và field Cogover mà ứng dụng cần
CONTRACT.md           đặc tả chi tiết (chỉ có tiếng Việt; ID trong đó là giá trị mẫu); comment trong code trỏ tới các mục của file này
```

Công nghệ: React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui trên Radix, Plate (trình soạn rich text), Vitest, Playwright.

## Test

```bash
# unit test (app/)
cd app
npm run typecheck
npm run test:unit

# test end-to-end trên bản build với API giả lập (e2e/)
cd app && npm run build
cd ../e2e && npm install && npx playwright install chromium
npm run test:e2e:local
```

## Chạy trên Workspace Cogover của bạn

Ứng dụng không có backend riêng: nó gọi Records API của Workspace bằng phiên đăng nhập của người dùng.

1. Tạo các Object và field liệt kê trong [`objects/README.md`](objects/README.md).
2. Thêm một bộ ID Workspace, Object và field của bạn vào `app/src/workspaces.ts`, gắn với hostname của bạn. Giữ nguyên bộ mẫu: ID giả trong đó là bộ mà mock local và test đang dùng. Hostname chưa có bộ riêng sẽ rơi về bộ mẫu và mọi request đều lỗi, nên hãy kiểm tra kỹ hostname bạn thêm.
3. Tạo một project Custom Frontend Module trong Workspace, chép `app/cogover.example.json` thành `app/cogover.json` rồi điền URL Workspace, mã project và slug project, sau đó build và publish bằng Cogover Dev CLI (`@cogover/dev-cli`, đã có trong dev dependency). Lần đầu CLI sẽ hỏi API key của Workspace:

   ```bash
   cd app
   npm run build
   npx cogover-dev publish
   npx cogover-dev activate <version-id>
   ```

Riêng Dev tools dùng được ngay, không cần các bước trên.

## Đóng góp

Xem [CONTRIBUTING.md](CONTRIBUTING.md) (tiếng Anh) để biết quy ước của code.

## Ghi nhận

Các component trong `app/src/components/ui/` được chỉnh từ [shadcn/ui](https://ui.shadcn.com) (MIT). Ứng dụng còn dùng Radix UI, Plate, bộ icon Lucide và phông chữ Inter (SIL Open Font License).

## Giấy phép

[MIT](LICENSE) © Cogover LLC
