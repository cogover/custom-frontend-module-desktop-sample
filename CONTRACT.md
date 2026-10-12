# Contract — SPA "Công việc" (Cogover Custom Frontend Module)

Đặc tả hành vi của ứng dụng: API, quy tắc nghiệp vụ, `data-testid` và tiêu chí nghiệm thu. Comment trong code và test trỏ tới các mục của file này (`CONTRACT §x`). Đổi hành vi thì cập nhật file này cùng lúc với code. Mọi ID và tên miền trong file là giá trị mẫu.

File này lớn lên cùng sản phẩm nên có văn phong nhật ký quyết định: "người dùng" trong các ghi chú kèm ngày là người đặt yêu cầu sản phẩm; "mẫu" / "thiết kế mẫu" là bản thiết kế HTML ban đầu (không nằm trong repo); "Workspace gốc" là Workspace nơi ứng dụng được xây dựng và kiểm chứng; nhãn "(Workspace)" ở tiêu chí nghiệm thu nghĩa là tiêu chí cần một Workspace thật mới kiểm được.

## 1. Quyết định thiết kế

> Thay đổi 2026-10-01 (yêu cầu người dùng sau bản v1): bộ lọc Vai trò thành **chọn nhiều** Tôi giao / Giao cho tôi / Tôi theo dõi, **mặc định chỉ Giao cho tôi** (mục 4, 5, 6, AC3, AC5).
> Thay đổi 2026-10-03: thêm bộ lọc **Mức ưu tiên** (chọn nhiều, mục 5 điểm 1b, AC27); app chạy như **cửa sổ macOS** trên "desktop" có **dock** bên trái (mục 5 điểm 1c, AC28); **@mention** trong ghi chú (mục 5 điểm 3f, AC29).
> Thay đổi 2026-10-04: Vai trò có thêm chip **Tất cả** và chọn giống Mức ưu tiên (mục 5 điểm 1, AC5); **giao lại** task của mình cho người khác, có hỏi thêm người được giao cũ vào người theo dõi (mục 5 điểm 2, 3d, 3g, AC30); **cột trái** kéo đổi độ rộng và ẩn/hiện được trên máy tính, giống app Ghi chú (mục 5 điểm 1d, AC31).
> Thay đổi 2026-10-04 (2): thêm app thứ hai **Ghi chú** trên cùng desktop/dock (mục 9; desktop nhiều cửa sổ: mục 5 điểm 1c; AC32–AC37).
> Thay đổi 2026-10-04 (3): URL giữ **app đang ở trước** (`?app=`), **từ khoá tìm kiếm** (`?q=`) và mục đang mở, refresh về đúng chỗ (mục 9.1, AC38); **một cỡ chữ 13.5px** cho mọi app, riêng h1/h2 20px (mục 5 "Cỡ chữ", AC39).
> Thay đổi 2026-10-04 (4): thẻ việc **bỏ nút xoá** (xoá trong popup), thêm cột **Giao cho** (`assignee`), cột **Ưu tiên chỉ icon cờ**, cột **Hạn chót** hẹp, tối đa 2 dòng (mục 5 "Người", điểm 5, mục 6, AC13, AC40); rê chuột lên Người giao / Giao cho / Ưu tiên hiện **hover card** (shadcn) ngay; dock giãn 12px; dải nút cửa sổ không còn che logo cột trái Ghi chú.
> Thay đổi 2026-10-12 (4): **khoảng cách quanh cửa sổ bằng nhau** — một khoảng `--win-gap` 16px cho: mép trái màn hình → dock, dock → cửa sổ, cửa sổ → mép trên / phải / dưới (desktop ≥ 881px); cửa sổ không còn giới hạn rộng 1600px (màn lớn vẫn đều).
>
> Thay đổi 2026-10-12 (3): app thứ tư **Dev tools** trên dock (mục 12, AC46) — JSON, Markdown, JWT, Base64, chạy hoàn toàn trong trình duyệt.
>
> Thay đổi 2026-10-12 (2): **lọc theo người trên chip** — mỗi chip người giao là nút (`person-chip`, `data-person-id`, `data-on` khi đang lọc, `data-rels`); bấm mở hộp `person-filter` với ba ô tick `person-rel-reporter` "Việc <tên> giao", `person-rel-assignee` "Việc giao cho <tên>", `person-rel-cc` "Việc <tên> theo dõi" (tick nhiều ô, nhiều người; OR giữa mọi ô đã tick), `person-filter-clear` "Bỏ lọc người này". Lọc tại chỗ trên danh sách đang hiển thị (không gọi API), cộng thêm vào các bộ lọc khác; chip và số trên chip tính **trước** khi lọc người nên không đổi; người đang lọc luôn có chip (số 0 nếu không giao việc nào, kể cả khi vượt 6 chip). Không lưu (mất khi tải lại trang). Không còn việc khớp → "Không có việc nào khớp người đã chọn", nút đặt lại bỏ luôn lọc người. AC45.
>
> Thay đổi 2026-10-12: **màn hình nhỏ (≤ 640px)** — không hiển thị ảnh nền (nền `--surface`), cửa sổ app (Công việc, Ghi chú, Cài đặt) tràn hết chiều ngang và cao hết màn hình, không viền / bo góc / bóng; chừa 88px phía dưới cho dock.
>
> Thay đổi 2026-10-08 (2): **cột danh sách** — cột **Mã** (`task-code`, `name` TAS-xxxx) đầu tiên sau ô tick — link chữ xanh (`--accent`) `#/task/<id>`, bấm mở popup việc, Ctrl/Cmd+bấm mở tab mới; nút **Chọn cột hiển thị** (`list-columns`, trước Làm mới) mở `columns-menu`: tick ẩn/hiện từng cột (`column-option[data-column]`, Công việc luôn hiện), `column-up-<id>` / `column-down-<id>` đổi thứ tự, `columns-reset` "Mặc định" khôi phục thứ tự + cột + độ rộng; **kéo đường giữa hai tiêu đề cột** (`col-resize-<id>`) đổi độ rộng — đường sau một cột cố định đổi cột đó, đường sau Công việc đổi cột kế tiếp (Công việc luôn chiếm phần còn lại), double-click về độ rộng mặc định; giới hạn mỗi cột (Mã 56–200, Trạng thái 96–260, Người giao / Giao cho 48–240, Ưu tiên 44–200, Hạn chót 64–240). Tiêu đề và thẻ dùng chung một lưới. Lưu localStorage `cong-viec.columns` `{ order, hidden, widths }` (mỗi trình duyệt, không đồng bộ giữa máy). Thẻ xếp dọc (≤980px): mã trên tiêu đề, cột ẩn vẫn ẩn, thứ tự áp cho dòng meta. AC44.
>
> Thay đổi 2026-10-08 (review local): form tạo xếp Người giao · Người được giao · Người theo dõi một hàng (3e); avatar Người giao / Giao cho trên thẻ 30px (mục 6); sửa / xoá ghi chú của chính mình trong timeline (3c, mục 4 "Activities"); trình soạn tự tạo link khi gõ / dán URL rồi cách hoặc Enter (3b); nút **Làm mới** (`list-refresh`, icon, tên "Làm mới") ngay trước các chip người giao trên thanh tiêu đề danh sách: tải lại việc chưa xong + đếm việc đã xong + transition rule như lúc mở app nhưng **giữ danh sách trên màn hình** (không màn chờ), nút khoá khi đang tải; trang việc đã xong tải lại từ đầu; lỗi → toast "Không làm mới được: …", danh sách giữ nguyên; mất phiên → màn hết phiên. AC42–43.
>
> Thay đổi 2026-10-04 (5): object **`user_settings`** (thiết lập cá nhân, một bản ghi mỗi người) và app thứ ba **Cài đặt** trên dock — đổi **ảnh nền Desktop** (mục 10, AC41).
> Thay đổi 2026-10-04 (6): Vai trò thêm **"Tôi giao người khác"** (tôi là người giao, người được giao không phải tôi — mục 5 điểm 1, AC5); form tạo có **"Người theo dõi"** (mục 4 "Ghi dữ liệu", mục 5 điểm 2, AC10).

- Loại module: **Custom Frontend Module dạng single page app thuần** (không backend). Gọi thẳng API record của Cogover bằng phiên người dùng đang đăng nhập (cookie cùng origin).
- Phạm vi "Công việc của tôi": task mà người đang đăng nhập là **người được giao (`assignee`) HOẶC người giao (`reporter`) HOẶC nằm trong người theo dõi (`ccs`)**.
- **Giữ nguyên schema** Object `task` (không sửa field/option). UI dùng đúng 7 trạng thái và 4 mức ưu tiên thật; hạn chót bắt buộc, có giờ.
- Được tạo/sửa/xoá task thử trên Workspace để kiểm thử: tiêu đề bắt đầu bằng `[E2E]`, assignee = chính người test, dọn hết sau khi test.

## 2. Workspace & Project

| Mục | Giá trị |
|---|---|
| Workspace | Workspace Cogover của bạn (ví dụ `https://acme.cogover.example`) |
| Frontend Project | Custom Frontend Module, slug `cong_viec`; URL sau deploy `/<slug slot>/index.html`, ví dụ `/_cm_5/index.html` (cần đăng nhập Cogover) |
| Object | xem `objects/README.md`; ID khai báo trong `app/src/workspaces.ts` |
| Thư mục frontend | `app/` (Vite + React + TS) |
| Thư mục E2E | `e2e/` (Playwright, project riêng) |

## 3. Stack bắt buộc

- Vite (mới nhất, 8.x) + React 19.3 + TypeScript, package `radix-ui` (unified, 1.6.x mới nhất) cho Dialog, Popover, Toast/AlertDialog, Select nếu cần; `lucide-react` (1.49.x mới nhất) cho icon. Có thể thêm `dompurify` để sanitize HTML mô tả, `@fontsource-variable/inter` để tự đóng gói font Inter (không gọi Google Fonts / CDN ngoài).
- `vite.config.ts`: `base: "./"`; build ra `dist/index.html` + `dist/assets/*` có content hash; **không** source map trong build publish.
- Routing: hash (`#/task/<recordId>` mở popup chi tiết của task đó). Không phụ thuộc server fallback.
- Không có secret/API key/cookie trong source hay biến `VITE_*`. Không gọi `localhost` trong code production.
- Unit test: Vitest + @testing-library/react, lệnh `npm run test:unit:coverage`, ngưỡng **line coverage ≥ 70%** đo trên toàn bộ `src/` kể cả file chưa được test import (`coverage.all`); chỉ loại test, fixture, `*.d.ts`, cấu hình — không loại code nghiệp vụ, entrypoint hay UI. Exit code ≠ 0 khi fail hoặc dưới ngưỡng. `npm run build` (tsc + vite build) và `npm run lint` (nếu có) phải pass.
- `cogover.json` trong `app/` (chép từ `cogover.example.json`, không commit): URL Workspace và mã project Custom Frontend Module của bạn.

### 3a. shadcn/ui cho ô nhập (yêu cầu người dùng 2026-10-01, chọn bản **Radix**, phạm vi **toàn bộ ô nhập**)

- Dùng **shadcn/ui biến thể Radix** (`https://ui.shadcn.com/docs/components/radix/...`, CLI `npx shadcn@latest add ...` hoặc copy thủ công vào `src/components/ui/`), kèm phụ thuộc chuẩn của shadcn: Tailwind CSS v4 (`@tailwindcss/vite`), `class-variance-authority`, `clsx`, `tailwind-merge`, `react-day-picker` (Calendar), `cmdk` (Command cho Combobox), `date-fns` (locale `vi`). Primitive vẫn là package `radix-ui` hiện có (không thêm Base UI).
- Thay bằng shadcn: **Select** (trạng thái trên thẻ `task-status`, sắp xếp `sort-by`, trạng thái trong form `field-status`; app Ghi chú 2026-10-04: thư mục `note-folder` / định dạng `note-format` trong form soạn, "Nằm trong" `new-folder-parent`, quyền `share-role` — trigger mang `data-value`; không còn `<select>` gốc, test `src/conventions.test.ts` chặn, xem `CONTRIBUTING.md`), **Date Picker = Popover + Calendar** (hạn chót `field-due-date`, lọc tuỳ chọn `due-from`/`due-to`), **giờ** = shadcn Select các mốc 30 phút 00:00–23:30 (mặc định 17:00; giờ hiện có không trùng mốc, ví dụ 14:28, vẫn hiện như 1 option), **Combobox** (Popover + Command) cho Người giao/Người được giao, **Input/Textarea** shadcn cho tiêu đề, mô tả, ô sửa nhanh tiêu đề. Giữ nguyên thiết kế riêng của: chip lọc sidebar, ô tìm kiếm topbar, checkbox tick trên thẻ, nút.
- Giao diện: ánh xạ biến theme của shadcn (`--background`, `--foreground`, `--popover`, `--primary`, `--muted`, `--accent`, `--border`, `--input`, `--ring`, `--radius` = 4px…) sang token sáng/tối hiện có; dark theo `[data-theme="dark"]` và theo hệ thống như token hiện tại; font stack giữ nguyên. **Không animation/transition** (bỏ các class `animate-in/out`, `fade`, `zoom`, `slide`, `transition-*` của shadcn) để không làm chậm mở/đóng. Tailwind **không được phá CSS hiện có**: không dùng preflight toàn cục (import riêng `theme` + `utilities`), hoặc kiểm chứng ảnh trước/sau giống nhau.
- Lịch: tiếng Việt (`vi`), tuần bắt đầu Thứ Hai, hiển thị ngày dạng `dd/MM/yyyy` trên nút; ngày chọn được hiểu theo UTC+7 như mục 5. Bàn phím dùng được (mũi tên, Enter, Esc).
- E2E: `data-testid` cũ chuyển sang **nút trigger** tương ứng (Select trigger, nút Date Picker, nút Combobox); option có `role="option"` và tên đúng nhãn; popover lịch `data-testid="calendar"`, ô ngày là button có accessible name chứa ngày (theo react-day-picker); danh sách Combobox giữ `person-option` + `data-person-id`.

## 4. API (đã kiểm chứng trên Workspace 2026-10-01)

Mọi request: `POST`, URL tương đối cùng origin, `credentials: "same-origin"`, header:

```
content-type: application/json
x-csrf-token: <giá trị cookie XSRF-TOKEN>
x-xsrf-token: <giá trị cookie XSRF-TOKEN>
x-req-type: 9
x-req-service: <theo bảng>
```

Response thành công: HTTP 200 và `{ "r": 0, "msg": "...", "data": ... }`. `r !== 0` hoặc HTTP ≠ 2xx là lỗi (hiện `msg`). HTTP 401/403 hoặc header `x-proxy-error: 1` kèm lỗi phiên → trạng thái "Phiên đăng nhập đã hết hạn" + link mở `/` để đăng nhập lại. Lỗi CSRF: `r: 19000` `CSRF_TOKEN_NOT_VALID`. **Thực tế trên Workspace gốc (E2E 2026-10-01): mất cookie phiên trả HTTP 400 + `r: 19000`, không phải 401/403** → app coi `r: 19000` là phiên hết hạn.

| Thao tác | Path | `x-req-service` | Body | `data` trả về |
|---|---|---|---|---|
| List / đọc 1 record | `/api/v1/records/list` | `217` | xem dưới | `{ total, rows[], search_after[] }` |
| Tạo | `/api/v1/records` | `10200` | `{workspace_id, object_type, client_time_zone:"Asia/Saigon", data:{object_type, workspace_id, ...fields}}` | `{ id }` |
| Sửa (partial) | `/api/v1/records` | `10201` | như tạo, `data` có thêm `id` và chỉ các field đổi | `{}` |
| Xoá | `/api/v1/records/delete` | `218` | `{workspace_id, object_type, ids:[...]}` | `{ deleted[], not_deleted[] }` |
| Upload file đính kèm | `/api/v1/file/upload/v2/client_upload` | — (không gửi `x-req-service`/`x-req-type`; vẫn gửi CSRF) | `multipart/form-data`: `field_slug=attachment_files`, `object_slug=task`, `file` | FILE_METADATA `{fileName, fileSize, file_id, acl:"private", fileExt, fileType, resolutionSizes, fileServerUrlTemplate, url}` |

Hằng số: `workspace_id = "WSDEMO0000001"`, `object_type = "OTDEMOTASK001"` (đặt trong module config có tên rõ ràng).

### Body list

```json
{
  "object_slug": "task",
  "type": 3,
  "logic_sequence": "(1 OR 2 OR 3) AND 4",
  "filters": [
    {"field":"assignee","op":"=","params":"$currentUser","fieldType":"lookup_normal"},
    {"field":"reporter","op":"=","params":"$currentUser","fieldType":"lookup_normal"},
    {"field":"ccs","op":"in","params":["$currentUser"],"fieldType":"lookup_normal"},
    {"field":"status","op":"in","params":["new","in_progress","pending","on_hold"],"fieldType":"single_choice"}
  ],
  "fields": ["id","name","subject","description","due_date","priority","status","reporter","assignee","ccs","attachment_files","created","updated"],
  "sorts": [{"due_date":{"order":"asc"}}],
  "order_direction": "next",
  "search_after": [],
  "size": 100
}
```

- `fields` BẮT BUỘC có `"id"` (không có thì row không có id). Lookup (`reporter`, `assignee`, `ccs`) vẫn trả nguyên object nhân sự (~1–3 KB/người): chỉ đọc `id`, `first_name`, `last_name`, `avatar`; không hiển thị/ghi log field khác (email, ngày sinh, số điện thoại…).
- Phân trang: tối đa 100 dòng/trang; trang sau gửi lại **nguyên văn** `data.search_after` của trang trước; dừng khi `rows.length < size` hoặc đã đủ `total`.
- `type`: `1` = AND, `2` = OR, `3` = theo `logic_sequence`. Thiếu `type` → `r: 27`; `filters: []` → `r: 25` (không gửi filter rỗng).
- Server sort theo field lựa chọn (`priority`, `status`) đi theo chữ cái slug → **sắp xếp ưu tiên/trạng thái làm ở client**.
- Đọc 1 record: list với filter `{"field":"id","op":"=","params":"<TAS…>","fieldType":"short_text"}`, `size: 1`.
- Người dùng hiện tại: list `object_slug: "personnel"`, filter `{"field":"id","op":"=","params":"$currentUser","fieldType":"short_text"}`, `fields: ["id","first_name","last_name","avatar"]`, `type: 1`, `logic_sequence: ""`.
- Danh sách chọn người: list `personnel`, filter `{"field":"status","op":"=","params":"ACTIVE","fieldType":"single_choice"}`, `fields: ["id","first_name","last_name","avatar","work_status"]`, sort `first_name asc`, `size: 100` + phân trang. Tải lười khi mở form lần đầu, cache trong phiên.

### Chiến lược tải

1. Song song: người dùng hiện tại; **toàn bộ task mở** trong phạm vi (status ∈ open, mọi trang — luôn đủ 3 vai trò, lọc vai trò ở client); **đếm task đã xong theo vai trò đang tick** (status ∈ done, `size: 1`, đọc `total`; filter phạm vi chỉ gồm các điều kiện của vai trò đang tick, nối OR, rồi AND status — ví dụ chỉ "Giao cho tôi": `type: 1`, `assignee = $currentUser` AND status in done; hai vai trò: `type: 3`, `"(1 OR 2) AND 3"`). Không tick vai trò nào → không gọi API, đếm = 0.
2. Task đã xong chỉ tải khi bộ lọc nhanh là "Tất cả" hoặc "Đã xong", với filter phạm vi theo **vai trò đang tick** như trên; đổi vai trò → bỏ các trang đã xong đã tải, đếm lại và tải lại từ đầu (giữ task mở). Trang 100, sort `updated desc`; cuối danh sách có nút "Tải thêm" (`data-testid="load-more"`) khi còn. Tìm kiếm/lọc/sắp xếp client-side trên phần đã tải, có dòng chú thích "Đã tải X/Y việc đã xong".
3. Sau mỗi thao tác ghi thành công: cập nhật state cục bộ (không tải lại cả danh sách); tạo mới thì đọc lại record vừa tạo (list theo id) để có `name`, `created`, lookup đầy đủ.

### File đính kèm (field `attachment_files`, kiểu file nhiều giá trị — kiểm chứng trên Workspace 2026-10-01)

- Upload từng file (song song tối đa 3) ngay khi người dùng chọn → nhận FILE_METADATA; giữ nguyên object metadata để ghi vào record.
- Tạo: `data.attachment_files = [meta, ...]` (không có file thì không gửi). Sửa: gửi **toàn bộ danh sách** (file cũ còn giữ + file mới); bỏ hết → gửi `null` (gửi `[]` bị từ chối `r: 607` "min length is: 1"); không đổi → không gửi.
- Đọc: thêm `attachment_files` vào `fields`; mỗi phần tử có thể là chuỗi JSON hoặc object → parse an toàn.
- Tải/xem: link phải là `/files/<file_id>/original/<fileName>?redirect=true` cùng origin — với `?redirect=true` server trả **thẳng nội dung file** (200, `application/octet-stream`, đã kiểm với PDF thật); **không có** `?redirect=true` thì server trả JSON `{"url":"<URL ký tạm>"}` (text/plain) — sai trải nghiệm. Thẻ `<a>` có `href` đó, `target=_blank`, `rel=noopener noreferrer`, thuộc tính `download="<fileName>"`. Không dùng `fileServerUrlTemplate`.
- File đã upload nhưng huỷ form thì bị bỏ lại trên file-server (không có API xoá) — chấp nhận.
- Cấu hình field `attachment_files` (đọc lại 2026-10-01, sau khi người dùng duyệt đổi sang nhóm **Tệp & Media** `file-media`): `file_type` = doc, docx, xlsx, xls, csv, ppt, pptx, pdf, txt, rtf, html, htm, zip, json, md, jpg, jpeg, png, gif, webp, svg, bmp, tiff, tif, heic, mp4, mov, avi, wmv, mkv, mp3; `max_size` 50 MB; `multiple_limit` 1–10; `is_public: false`. Đuôi ngoài danh sách → upload trả HTTP 400 `r: 15` `file type not allowed`; ghi record quá 10 file → HTTP 422 `r: 608` `Field [Attachment files] max length is: 10 but got: 11.0`. Server đổi khoảng trắng trong tên file thành `-` (dùng `fileName` server trả).
- Giới hạn phía client (thay đổi 2026-10-01, người dùng duyệt): tối đa **50 MB/file** (khớp `max_size`), tối đa **10 file mỗi công việc** tính cả file đã có + đang tải (file lỗi không tính); vượt thì bỏ qua và hiện ghi chú `attach-note` "Mỗi công việc đính kèm tối đa 10 file — đã bỏ qua N file." Không chặn theo đuôi ở client (server là nguồn chuẩn, quản trị có thể đổi danh sách).
- File lỗi: chip `data-state="error"` + lý do hiện rõ dưới các chip (`attach-errors` role=alert, mỗi dòng `attach-error` "<tên>: <lý do>"), lý do tiếng Việt cho lỗi đã biết ("Không nhận loại file .png", "File lớn hơn 50 MB", "File rỗng"), lỗi khác giữ `msg` server. Bấm Lưu/Tạo khi còn file lỗi → **không gửi**, hiện `form-error` "Còn N file chưa tải lên được. Bỏ file lỗi (bấm ×) rồi lưu lại." và focus nút × của file lỗi đầu tiên; bỏ hết file lỗi thì thông báo tự mất.

### Ghi dữ liệu

- Field ghi: `subject` (string 1–255), `description` (chuỗi HTML), `due_date` (số ms epoch), `priority` (slug), `status` (slug), `reporter` (personnel ID), `assignee` (personnel ID), **`ccs` (thay đổi 2026-10-03, người dùng yêu cầu sửa người theo dõi trong chế độ xem): mảng personnel ID, bỏ hết → `null`** (đã kiểm trên Workspace: `["PER…"]` và `null` đều OK). Khi tạo task **không** gửi `project`; `ccs` chỉ gửi khi người dùng chọn người theo dõi trong form (2026-10-04, mảng ID — thay cho mặc định), để trống thì không gửi để Workspace tự áp default (người theo dõi và dự án mặc định của Workspace).

### Quy trình trạng thái (transition rule — thêm 2026-10-03, người dùng xác nhận rule là cố ý)

- Workspace có transition rule "Status" (`TRDEMOSTATUS1`, field `status` = `OFDEMOTASKSTA`): tạo mới chỉ ở `new` (flow từ `_initial`); new→in_progress | cancelled; in_progress→pending | on_hold | resolved; pending→in_progress | resolved | cancelled; on_hold→in_progress | cancelled; resolved→closed; closed/cancelled không đi tiếp. Server từ chối bước khác: cập nhật → HTTP 422 `r: 48` "Your target value [x] is not allowed, current value: [y], available values: […]"; tạo với trạng thái ngoài `_initial` → HTTP 500 `r: -1` "Value: [x] is not in transition rule". **`allowUndo: true` không cho quay ngược qua Records API** (đã thử: resolved→in_progress, in_progress→new bị `r: 48`).
- App đọc rule một lần khi tải (song song me/task): `GET /api/v1/object_security/transition_rule?objectSlug=task` (cookie + CSRF, không `x-req-*`), gộp flow của các rule **active** trên field status; bỏ qua rule `shouldFilterRecord: true` (để server kiểm). Đọc lỗi (kể cả 403) → coi như không có rule (hiện đủ 7 trạng thái), không báo phiên hết hạn.
- Có rule: Select trạng thái ở thẻ (`task-status`), popup xem (`view-status`) và form sửa (`field-status`) chỉ có trạng thái hiện tại + các bước được phép (theo thứ tự danh sách trạng thái); form tạo (`field-status`) chỉ các trạng thái từ `_initial` (mặc định `new` nếu có). Checkbox `task-checkbox` khoá (`disabled`, vẽ nét đứt) khi bước tick (→ `resolved`) hoặc bỏ tick (→ trạng thái trước/`new`) không được phép, title giải thích "Quy trình không cho chuyển từ “X” sang “Y”". Toast sau khi đổi trạng thái chỉ có "Hoàn tác" khi bước ngược được phép. Mọi bước bị chặn trong app → toast lý do, không gửi request. Lỗi `r: 48`/"not in transition rule" từ server (rule đổi sau khi tải) → thông báo tiếng Việt "Quy trình không cho chuyển từ “X” sang “Y”" / "Quy trình không cho phép trạng thái “X” ở bước này", giá trị cũ được trả lại.

### Activities (Object `activity`, ID `OTDEMOACTIV01` — thêm 2026-10-03, đã kiểm trên Workspace)

- Liên kết task: field **`Task`** (lookup_normal → task, slug viết hoa). Đọc: list `object_slug: "activity"`, `type: 1`, `logic_sequence: ""`, filter `{"field":"Task","op":"=","params":"<TAS…>","fieldType":"lookup_normal"}`, `fields: ["id","name","activity_type","content","created","created_by","activity_time","files"]`, sort `created desc`, `size: 15` + `search_after` (nút "Xem thêm"), `total`. Mọi loại (`activity_type`: note, task, call, meeting, email, sms, chat, facebook_comment, chat_zalo_fb — nhãn: Ghi chú, Công việc, Gọi điện, Họp, Email, SMS, Chat, Facebook, Live-chat). `name` có thể rỗng; `content` là HTML của CKEditor (div, mention `<span data-autocomplete-type="mention">`, ảnh `src` còn placeholder `{resolution_size}` → hiển thị thay bằng `original`).
- **Tạo ghi chú** bằng Records API chuẩn (không dùng endpoint riêng của giao diện gốc): `POST /api/v1/records` service `10200`, `object_type: "OTDEMOACTIV01"`, `data`: `activity_type: "note"`, `note_type: "normal"`, **`name: ""`** (ghi chú không có chủ đề; key bắt buộc — `null`/thiếu → `r: 602`), `content` (HTML sạch từ trình soạn), `Task`, `source_object: "task"`, `source_record: <task id>`, `manual_log: 1`, `activity_time: now`; ảnh dán vào → upload `field_id=OFDEMOACTIMG1` (`_attachments` của activity) + `object_id=OTDEMOACTIV01`, src có `long_text_field_id=OFDEMOACTCONT` (field `content`), gửi `_attachments` như mô tả task (mục 3b). Đã kiểm: ghi chú tạo cách này hiện trong timeline gốc của Cogover. Tạo xong đọc lại record theo id rồi chèn đầu timeline.
- **Sửa / xoá ghi chú (2026-10-08):** chỉ activity `note` có `created_by` = tôi. Sửa: `POST /api/v1/records` service `10201`, `object_type` activity, `data` chỉ `id` + `content` (+ `_attachments` = ảnh đang lưu đọc lại theo id + ảnh mới dán, chỉ khi có dán ảnh); xong đọc lại theo id. Xoá: `POST /api/v1/records/delete` service `218`, `object_type` activity, `ids: [id]` — `deleted` không chứa id → báo lỗi. Quyền thật do Workspace kiểm.
- Tạo: luôn gửi `subject`, `description`, `due_date`, `priority`, `status`, `reporter`, `assignee`.
- Nếu Workspace có Process báo khi giao việc, Process đó gửi thông báo cho `assignee` khi tạo task hoặc đổi `assignee` (trừ chính người thao tác).

## 5. Ánh xạ dữ liệu & chênh lệch so với thiết kế mẫu

### Trạng thái (`status`, 7 option — thứ tự hiển thị)

| slug | Nhãn | Nhóm | Tone gợi ý |
|---|---|---|---|
| `new` | Mới | mở | grey |
| `in_progress` | Đang xử lý | mở | orange |
| `pending` | Đang chờ | mở | violet |
| `on_hold` | Tạm dừng | mở | sky |
| `resolved` | Đã xử lý | xong | green |
| `closed` | Đã đóng | xong | teal |
| `cancelled` | Đã huỷ | xong | red/muted |

- "Chưa xong" = nhóm mở; "Đã xong" = nhóm xong. Checkbox **checked** và tiêu đề gạch ngang khi status thuộc nhóm xong. **Ngoại lệ (yêu cầu 2026-10-01):** trong danh sách bộ lọc nhanh "Đã xong", thẻ đã xong hiển thị như thẻ thường — tiêu đề không gạch ngang, chữ/mô tả/dòng meta không mờ (checkbox vẫn checked); ở "Tất cả" vẫn gạch ngang + mờ. Popup chi tiết giữ nguyên.
- Tick → `resolved`. Bỏ tick → trạng thái trước đó nếu vừa đổi trong phiên (nhớ theo task), không có thì `new`.
- Sắp xếp "Trạng thái": theo thứ tự bảng trên (cao→thấp = ngược bảng hoặc theo nhãn hướng — dùng hằng số rank rõ ràng).

### Ưu tiên (`priority`, mặc định `medium`)

| slug | Nhãn | Rank |
|---|---|---|
| `urgent` | Khẩn cấp | 4 |
| `high` | Cao | 3 |
| `medium` | Trung bình | 2 |
| `low` | Thấp | 1 |

Giá trị trống → coi như `medium` khi sắp xếp, hiển thị "—".

### Hạn chót (`due_date`, bắt buộc, ms epoch)

- Mọi tính toán ngày (Hôm nay, Ngày mai, Tháng này, Quá hạn, "Còn N ngày") theo múi giờ **Asia/Ho_Chi_Minh (UTC+7)**.
- Form: ô ngày + ô giờ (mặc định 17:00; ngày mặc định hôm nay nếu bây giờ < 17:00, ngược lại ngày mai). Không còn lựa chọn "Không có hạn".
- Hiển thị trên thẻ như mẫu ("Quá hạn N ngày", "Hôm nay", "Ngày mai", "D thg M[, YYYY]"); popup chi tiết hiện cả giờ.
- "Quá hạn" = `due_date < now` và chưa xong.

### Người

- Tên hiển thị: `` `${last_name} ${first_name}`.trim() `` (ví dụ "Nguyễn Thị Hoa", "D. Alex"); chữ cái avatar = ký tự đầu của `first_name`.
- Avatar: `avatar` là chuỗi JSON có `url` dạng `https://acme.cogover.example/files/0/<file_id>/{resolution_size}/<name>`; thay `{resolution_size}` bằng `small`. Parse lỗi/không có/ảnh lỗi → avatar chữ cái (tone theo hash tên như mẫu).
- Cột "Người giao" trên thẻ = `reporter`, cột "Giao cho" = `assignee` (2026-10-04); mỗi cột chỉ avatar căn giữa tiêu đề cột, tên ở title / tên truy cập ("Người giao: …" / "Giao cho: …", trống: "Chưa có người giao" / "Chưa giao cho ai", gạch "—"). Khi dòng meta xuống hàng (≤980px): nhãn vai trò + avatar + tên. Rê chuột lên ô Người giao / Giao cho / Ưu tiên → **Hover Card** shadcn (Radix, không animation, `openDelay` 0, `closeDelay` 100ms, không còn `title` gốc): người = avatar 36px + họ tên + vai trò (`task-reporter-card` / `task-assignee-card`; trống: "Chưa có người giao" / "Chưa giao cho ai"); ưu tiên = "Mức ưu tiên" + chip cờ màu tone kèm nhãn (`task-priority-card`). Popup chi tiết hiện Người giao, Người được giao (`assignee`), Người theo dõi (`ccs`).

### Vai trò của tôi với từng task

- `assignee.id === me` → "Được giao"; `reporter.id === me` → "Tôi giao"; `me ∈ ccs` → "Theo dõi" (có thể nhiều vai trò).
- **Sửa được** khi tôi là assignee hoặc reporter. Chỉ theo dõi → chỉ xem: checkbox, chọn trạng thái, sửa nhanh tiêu đề, nút xoá, nút Sửa đều vô hiệu; thẻ có nhãn nhỏ "Theo dõi"; popup có ghi chú "Bạn chỉ theo dõi công việc này".

### Thay đổi giao diện so với mẫu

1. Sidebar thêm nhóm **"Vai trò"** — **chọn nhiều** (checkbox, giao diện chip như nhóm Hạn chót), thứ tự: **Tất cả** (`role-filter-all`, 2026-10-04) / **Tôi giao** (`reporter`) / **Tôi giao người khác** (`role-filter-delegated`, 2026-10-04: `reporter` = tôi VÀ `assignee` ≠ tôi; server: `{"field":"assignee","op":"!=","params":"$currentUser"}`, đã kiểm trên Workspace gốc; nằm trong "Tôi giao" nên tick cả hai thì chỉ hỏi `reporter`; "Tất cả" vẫn là ba vai trò Tôi giao / Giao cho tôi / Tôi theo dõi) / **Giao cho tôi** (`assignee`) / **Tôi theo dõi** (`ccs`). Tick mục nào thì hiện task khớp **bất kỳ** mục đã tick (OR). **Mặc định chỉ tick "Giao cho tôi"** (cả lần đầu lẫn "Đặt lại bộ lọc"). **"Tất cả" chọn giống Mức ưu tiên:** "Tất cả" = cả ba vai trò (lưu `roles` đủ 3 giá trị) — khi bật thì ba chip vai trò hiện không tick; bấm một vai trò lúc đang "Tất cả" → chỉ còn vai trò đó; tick đủ cả ba → thành "Tất cả"; bỏ tick vai trò cuối cùng → về "Tất cả" (không còn trạng thái "không tick gì" khi bấm). "Tất cả" khác mặc định nên vẫn tính là "đang lọc". View đã lưu từ bản cũ có `roles: []` → danh sách rỗng với `empty-state` tiêu đề "Chưa chọn vai trò nào", phụ đề "Tick ít nhất một mục trong Vai trò để xem công việc." và nút `empty-reset`. Số đếm của bộ lọc nhanh (Chưa xong / Tất cả / Đã xong) **tính theo vai trò đang tick** (không theo lọc hạn/tìm kiếm). Tạo task không khớp vai trò đang tick → tự tick thêm vai trò của task đó. Lưu vào view trong `localStorage` dạng mảng `roles`; giá trị `role` (đơn) cũ bỏ qua, dùng mặc định. Vai trò khác mặc định tính là "đang lọc" (hiện nút đặt lại như lọc hạn).
1b. **Bộ lọc "Mức ưu tiên" (2026-10-03)** ngay sau nhóm Vai trò: chip checkbox **Tất cả** / Khẩn cấp / Cao / Trung bình / Thấp. "Tất cả" (mặc định) = không lọc; tick một vài mức → hiện task có **bất kỳ** mức đã tick (OR); tick đủ cả 4 hoặc bấm "Tất cả" → quay về "Tất cả" (bỏ tick các mức). Task không có ưu tiên chỉ hiện khi "Tất cả". Như lọc hạn: không ảnh hưởng số đếm bộ lọc nhanh, tính là "đang lọc" (badge +1, nút "Đặt lại bộ lọc" về "Tất cả"), áp cho cả task đã xong đã tải. Lưu trong view `localStorage` dạng mảng `prios` (rỗng = Tất cả; giá trị lạ → Tất cả). Rỗng do lọc: phụ đề "Chọn khoảng hạn chót, vai trò hoặc mức ưu tiên khác, hoặc đặt lại bộ lọc." Chip của nhóm chọn nhiều (Vai trò, Mức ưu tiên) có **ô tick nhỏ** bên trái nhãn (`.chip.multi .chip-box`) để thấy ngay là chọn được nhiều — nội dung chip canh trái, ô tick cách mép trái chip đều nhau (9px) ở mọi chip, lề phải bằng lề trái (8px + viền); nhãn dài không vừa thì xuống 2 dòng (chip cao lên, các chip cùng hàng cao bằng nhau), không tràn ra ngoài viền; nhóm Hạn chót (chọn một) giữ chip trơn.
1c. **Desktop kiểu macOS (2026-10-03)**: `main.tsx` dựng `Desktop` (`src/desktop/`) bao quanh app.
   - **Nút cửa sổ** ở góc trái trên khung (trên dòng "Công việc"): đỏ **Đóng** (`win-close`), vàng **Thu nhỏ** (`win-minimize`), xanh **Phóng to toàn màn hình** / **Thu về cửa sổ** (`win-maximize`, `aria-pressed`); hình ×, −, mũi tên hiện khi rê chuột vào nhóm (như macOS). Trên máy tính (≥ 881px), khi cuộn cột trái, ba nút nằm trên một dải tiêu đề dính trên cùng (nền cột trái), nội dung cột trái trượt xuống dưới dải này, không bị nút che.
   - **Đóng** → gỡ cửa sổ (app dừng, dock không còn chấm); bấm icon trên dock mở lại **từ đầu** (tải lại dữ liệu, tìm kiếm trống). **Thu nhỏ** → ẩn cửa sổ (`.page[hidden]`), giữ nguyên mọi trạng thái, phím tắt tạm tắt; bấm icon dock hiện lại, không tải lại. **Phóng to** → khung phủ kín trang (không viền/bo góc, không max-width), dock ẩn; bấm lại thì về cửa sổ; lựa chọn này nhớ trong `localStorage` `cong-viec.window` = `max|normal`. Đóng/thu nhỏ không nhớ qua lần tải trang.
   - **Dock** (`dock`, nav "Ứng dụng") cố định giữa mép trái (điện thoại ≤ 640px: giữa mép dưới, nằm ngang), nền kính mờ trong suốt (không `backdrop-filter`); padding 12px ở hai đầu, 8px hai cạnh dài, các app cách nhau 12px (2026-10-04); mỗi app là nút vuông 48px bo 12px (`dock-app-<id>`, tên đọc = tên app, nhãn tên hiện bên cạnh khi rê chuột), app đang chạy có chấm nhỏ phía mép màn hình và `data-running="true"`. Danh sách app ở `src/desktop/apps.tsx` (`DOCK_APPS`): hiện chỉ "Công việc" (`cong-viec`, chính app này); thêm app = thêm phần tử `{ id, name, icon (node hoặc { src }), background?, href, newTab? }` — bấm app khác mở `href` ở tab này (hoặc tab mới khi `newTab`).
   - Khung chừa chỗ cho dock (`.desktop .page` padding trái 92px; popup cũng nằm bên phải dock).
1d. **Cột trái đổi độ rộng / ẩn được (2026-10-04, giống app Ghi chú)** — chỉ trên máy tính (≥ 881px, `matchMedia('(min-width: 881px)')` có nghe `change`); ≤ 880px giữ nguyên như cũ (bỏ qua trạng thái ẩn đã lưu, không có nút ẩn, không có tay kéo).
   - **Tay kéo** `side-resizer`: phần tử absolute trong `.board` (không nằm trong cột trái vì cột trái tự cuộn), `left: calc(var(--side-w) - 3px)`, rộng 6px, z-index 3, `touch-action:none`; vạch accent 2px ở giữa hiện khi hover / focus-visible / đang kéo. `role="separator"`, `aria-orientation="vertical"`, `aria-label="Đổi độ rộng cột trái"`, `aria-controls` = id cột trái, `aria-valuemin=220`, `aria-valuemax=420`, `aria-valuenow` = độ rộng, `tabindex=0`, title "Kéo để đổi độ rộng · bấm đúp để về mặc định". Kéo bằng pointer (setPointerCapture; lúc kéo board có `data-resizing` → cả board `cursor: col-resize; user-select: none`); phím ←/→ bước 16px, Shift bước 48px, Home/End về 220/420; bấm đúp về 256px (mặc định). Độ rộng là CSS var `--side-w` trên board (`grid-template-columns: var(--side-w,256px) minmax(0,1fr)`), kẹp 220–420px.
   - **Nút ẩn/hiện** `side-toggle` (26px, icon 16px): nằm **trong** nhóm `.traffic` sau nút xanh, đẩy về mép phải dải tiêu đề (`margin:-7px -6px -7px auto`, dải không cao thêm); icon lucide `PanelLeftClose` / `PanelLeftOpen`; `aria-label` "Ẩn cột trái" / "Hiện cột trái", title thêm phím tắt "Ẩn cột trái (⌘\)" / "Hiện cột trái (⌘\)", `aria-controls` = id cột trái, `aria-expanded` true/false, `aria-keyshortcuts="Meta+Backslash Control+Backslash"`. Phím tắt **⌘/Ctrl + \** (không chạy khi cửa sổ đang thu nhỏ); có trong menu Trợ giúp.
   - **Khi ẩn:** cột trái và tay kéo không render, board 1 cột (`data-side="hidden"`); cả nhóm `.traffic` (ba chấm + nút) chuyển lên đầu topbar trong `.title-ctl`, trước ô tìm kiếm (không sticky, không padding/nền; nút có `margin-left:10px` cộng `gap:8px` của nhóm → cách nút xanh 18px, giống Ghi chú). Focus đang ở cột trái hoặc ở nút → focus lại nút sau khi đổi.
   - **Lưu** `localStorage` key `cong-viec.side` = `{ width, hidden }`: khi thả chuột (không lưu liên tục lúc kéo) và sau mỗi phím / bấm đúp / ẩn-hiện. Đọc: `width` phải là number hữu hạn (kẹp 220–420), không thì 256; `hidden` chỉ nhận `true`; JSON hỏng → mặc định.

2. Form tạo/sửa: "Người giao" và "Người được giao" là ô chọn nhân sự có tìm kiếm (Radix Popover + danh sách lọc không dấu, dùng được bằng bàn phím), mặc định cả hai = tôi. Bắt buộc ít nhất một trong hai là tôi (lỗi: "Bạn cần là người giao hoặc người được giao") — **trừ khi sửa task đang giao cho tôi và đổi người được giao** (giao lại, 2026-10-04, xem 3g). Trạng thái: select 7 option (mặc định `new`). Ưu tiên: 4 lựa chọn.
   - **Người theo dõi khi tạo (2026-10-04, bố cục 2026-10-08):** form tạo có ô "Người theo dõi" (`field-ccs`, ô chọn nhiều như `view-ccs`) **cùng hàng** với Người giao và Người được giao, ba ô rộng bằng nhau (form 720–920px: Người theo dõi xuống dưới Người được giao; dưới 720px một cột); trống hiện "Mặc định của Workspace" và không gửi `ccs` (Workspace tự thêm người theo dõi mặc định); có chọn thì gửi `ccs` = mảng ID. Form sửa không có hàng này (người theo dõi sửa trong popup xem, lưu ngay).
3. Mô tả (cập nhật 2026-10-01 — người dùng yêu cầu **Plate.js**): popup xem vẫn hiển thị HTML đã sanitize (DOMPurify) như cũ; trên thẻ hiện văn bản thuần rút gọn. **Soạn thảo (form tạo + sửa) dùng trình soạn rich-text Plate.js** (`platejs` 53.x + plugin chính thức `@platejs/*`; giao diện theo shadcn/Plate UI, token hiện có, không animation): thanh công cụ gọn gồm Đậm, Nghiêng, Gạch chân, Gạch ngang, Code, Tiêu đề 1–3, Danh sách chấm, Danh sách số, Trích dẫn, Liên kết, Hoàn tác/Làm lại; phím tắt chuẩn (Ctrl/Cmd+B/I/U, Z) và gõ tắt kiểu Markdown (`**`, `#`, `- `, `1. `, `> `); dán HTML từ clipboard giữ định dạng cơ bản. **Định dạng lưu là HTML ngữ nghĩa sạch, tương thích trình soạn của Cogover**: `p`, `br`, `strong`, `em`, `u`, `s`, `code`, `h1–h3`, `ul/ol/li` (danh sách lồng thật, dùng list cổ điển — không dùng list kiểu indent/style), `blockquote`, `a href` (http/https/mailto, `target=_blank rel=noopener noreferrer`), `img` — không class/data-attribute/style riêng của Plate; luôn sanitize trước khi gửi. Mô tả có sẵn (HTML từ Cogover) được nạp vào editor; **ảnh có sẵn được giữ nguyên** (hiển thị, xoá được; ảnh mới chèn bằng cách dán — xem mục 3b); nếu mô tả chứa phần tử không hỗ trợ (bảng, iframe, video, nhúng…) thì editor ở chế độ chỉ đọc kèm ghi chú "Mô tả có định dạng chưa hỗ trợ — hãy sửa trên Cogover" và **không gửi** `description`. Không đổi gì thì không gửi `description` (so sánh sau chuẩn hoá). Editor nạp lười (dynamic import, prefetch khi rảnh) để không làm chậm mở popup/tải trang. testid: `field-desc` trên vùng soạn (contenteditable, role textbox, tên "Mô tả"), thanh công cụ `rte-toolbar`, nút `rte-<bold|italic|underline|strike|code|h1|h2|h3|ul|ol|quote|link|undo|redo>`, `field-desc-locked` khi khoá.
3b. **Dán vào mô tả (yêu cầu người dùng 2026-10-02)** — giữ định dạng và ảnh như trình soạn CKEditor gốc của Cogover:
   - **Link tự động (2026-10-08):** gõ hoặc dán một URL `http(s)://…` / `mailto:` rồi gõ dấu cách hoặc Enter → URL thành link (`<a href>` khi lưu); scheme khác (ftp://…) giữ nguyên chữ. Áp cho mọi trình soạn rich text (Mô tả, ghi chú timeline).
   - **Định dạng:** Google Docs (bọc mọi thứ trong `<b style="font-weight:normal" id="docs-internal-guid-…">` — chỉ là vỏ, không làm đậm; định dạng ghi bằng style `font-weight`/`font-style`/`text-decoration`, kể cả giá trị "thường" `400`/`normal`/`none` để bỏ định dạng cha), Word desktop (`MsoTitle`→H1, `MsoSubtitle`→H2, đoạn `mso-list:lN levelM` + ký hiệu `mso-list:Ignore` → danh sách thật lồng theo level, số khi ký hiệu dạng `1.`/`a)`), Word bản web (mỗi mục một `<ul>` → gộp lại, chỉ khi dán). Tiêu đề, đậm/nghiêng/gạch chân/gạch ngang, danh sách lồng, dòng trống được giữ; bảng/màu/cỡ chữ vẫn bỏ.
   - **Ảnh (cách làm của trình soạn gốc, đã đo trên Workspace gốc 2026-10-02):** ảnh `data:` (trang web, ảnh chụp màn hình, Word), ảnh dán dạng file (`image/*` trong clipboard khi HTML không có chữ — "Copy image"), và ảnh Word `file:///…` (lấy từ RTF trong clipboard: nhóm `{\pict … \bliptagN …}` PNG/JPEG theo thứ tự, bỏ `\nonshppict`; chỉ thay khi số ảnh khớp) → hiện ngay, upload `POST /api/v1/file/upload/v2/client_upload` multipart `file`, **`field_id=OFDEMOTASKIMG`** (field hệ thống `_attachments`, `file-media`, `is_public: true`), **`object_id=OTDEMOTASK001`** (không gửi `x-req-*`), rồi thay src bằng `<origin>/files/0/<file_id>/original/<fileName>?redirect=true&long_text_field_id=OFDEMOTASKDSC` (`OFDEMOTASKDSC` = field `description`). Khi lưu gửi `_attachments` = metadata upload (giữ nguyên, `url` thêm `&long_text_field_id=OFDEMOTASKDSC`, `{resolution_size}` giữ dạng `%7Bresolution_size%7D`) của các ảnh **còn trong mô tả**; sửa task thì `_attachments` = danh sách hiện có trên server (đọc lại record ngay trước khi lưu) + ảnh mới, không trùng `file_id`; không có ảnh mới thì không gửi `_attachments`. Ảnh link http/https từ web giữ nguyên link (như trình soạn gốc). Kiểu `_attachments` không nhận (webp, avif) được vẽ lại thành PNG nếu trình duyệt giải mã được. Đang upload: dòng `desc-images-status` "Đang tải N ảnh lên…", nút lưu khoá với nhãn "Đang tải ảnh…"; upload lỗi: ảnh bị gỡ khỏi mô tả, dòng `desc-images-error` "Không tải được ảnh dán vào: <lý do>" (lý do tiếng Việt như đính kèm). Ảnh đã có trong mô tả lúc mở form không bao giờ upload lại. Ảnh upload rồi bị xoá trước khi lưu thì bị bỏ lại trên file-server (như đính kèm).
3c. **Activities trong popup xem (2026-10-03, người dùng chọn "Xem + tạo ghi chú", "mọi loại, một danh sách")**: mục "Hoạt động" dưới Mô tả (`activities`), tải khi mở popup xem (không tải khi tạo/sửa). Mỗi mục `activity-item` (`data-activity-id`, `data-type`): avatar + tên người tạo (`created_by`), nhãn loại, chủ đề (`name`, nếu có), thời gian (`activity_time` hoặc `created`, dạng `HH:mm dd/MM` — thêm `/yyyy` khi khác năm — title là ngày giờ đầy đủ), nội dung HTML đã sanitize hiển thị (ảnh `{resolution_size}` → `original`), file (`files`) dạng chip tải về như đính kèm. Khung nội dung mỗi mục nền xám (`--surface-2`, theo theme). Mới nhất trên cùng; 15 mục/lần, `activities-more` "Xem thêm" khi còn; trạng thái `activities-loading`, `activities-empty` ("Chưa có hoạt động nào"), `activities-error` + `activities-retry`. Nút `activity-add` "Thêm ghi chú" mở ô soạn `activity-composer` **chỉ có nội dung (không có ô Chủ đề — yêu cầu 2026-10-03), con trỏ được đặt ngay vào ô nội dung khi mở**: `activity-content-editor` (trình soạn rich text giống Mô tả, nhãn "Nội dung", dán định dạng/ảnh như 3b — ảnh vào `_attachments` của activity), `activity-cancel`, `activity-submit` "Lưu ghi chú" (khoá khi đang tải ảnh — nhãn "Đang tải ảnh…" — hoặc đang lưu — "Đang lưu…"); bấm lưu khi nội dung trống → `activity-error` "Nhập nội dung ghi chú", không gửi; lỗi server hiện ở `activity-error`, ô soạn giữ nguyên. Tiêu đề mục "Hoạt động · N" (N = `total`), nội dung từng mục `activity-content`, toast "Đã thêm ghi chú". Task chỉ theo dõi vẫn xem và thêm ghi chú được (ghi chú không sửa task). Không lọc theo loại. **Sửa / xoá ghi chú của tôi (2026-10-08):** mục `note` do tôi tạo có nút `activity-edit` (bút) và `activity-delete` (thùng rác) cạnh thời gian (hiện khi rê chuột / focus, luôn hiện trên màn cảm ứng); ghi chú người khác và loại khác không có. Sửa → khung nội dung thành trình soạn `activity-edit-composer` (`activity-edit-content-editor`, con trỏ ở cuối nội dung, `activity-edit-cancel`, `activity-edit-submit` "Lưu ghi chú", lỗi `activity-edit-error`); không đổi gì → đóng, không gửi; lưu xong hiện nội dung mới, toast "Đã sửa ghi chú". Xoá → hộp `confirm-note-delete` "Xoá ghi chú?" (`confirm-note-delete-cancel` có focus, `confirm-note-delete-ok` "Xoá", Esc chỉ đóng hộp) → bỏ mục, "Hoạt động · N" giảm 1, toast "Đã xoá ghi chú"; lỗi → toast "Không xoá được ghi chú: …", mục giữ nguyên.
3d. **Sửa nhanh trong popup xem (2026-10-03, "Lưu ngay khi chọn")**: khi task sửa được (không chỉ theo dõi), các giá trị Trạng thái (`view-status`, Select), Mức ưu tiên (`view-priority`), Hạn chót (`view-due-date` Date Picker + `view-due-time` giờ), Người giao (`view-reporter`), Người được giao (`view-assignee`) (Combobox như form), Người theo dõi (`view-ccs`: nút hiển thị chồng avatar + tên đầu + "+N" hoặc "Không có", `data-count`; bấm mở danh sách có ô tick từng người — `person-option` `data-checked` — tick/bỏ tick không lưu ngay, **đóng danh sách (Esc/bấm ra ngoài danh sách) thì lưu một lần nếu có đổi**; Esc chỉ đóng danh sách, popup vẫn mở) **là điều khiển, chọn xong lưu ngay** (một request 10201 chỉ chứa field đổi), cập nhật thẻ trong danh sách, toast "Đã lưu"; lỗi → trả giá trị cũ + toast lỗi. Đổi người giao khiến mình không còn là một trong hai → không lưu, toast "Bạn cần là người giao hoặc người được giao"; đổi người được giao (giao lại) theo 3g. Đổi trạng thái sang nhóm xong dùng cùng luồng như ô trạng thái trên thẻ (Hoàn tác). Task chỉ theo dõi: hiển thị tĩnh như cũ. Nút Sửa vẫn mở form đầy đủ (tiêu đề, mô tả, đính kèm).
3e. **Form tạo/sửa rộng (2026-10-03)**: khi vùng nội dung popup ≥ 920px, dòng 1 không xuống dòng. Form sửa: hai dòng thuộc tính dùng chung cột: cạnh phải ô Người giao = cạnh phải ô Mức ưu tiên, cạnh trái ô Hạn chót = cạnh trái ô Người được giao. Form tạo (2026-10-08): dòng 2 là Người giao · Người được giao · Người theo dõi, ba ô rộng bằng nhau (cột riêng, không thẳng cột dòng 1). Hẹp hơn giữ bố cục cũ.
3f. **@mention trong ghi chú (2026-10-03)**: trong ô Nội dung của "Thêm ghi chú" (placeholder "Viết ghi chú… (gõ @ để nhắc đến ai đó)"), gõ `@` (đầu dòng hoặc sau khoảng trắng/ngoặc; tối đa 3 từ, không xuống dòng, không có `@` thứ hai) → danh sách nhân sự dưới con trỏ (Radix Popover, `mention-list` role listbox "Nhắc đến nhân sự", mỗi dòng `mention-option` kèm `data-person-id`: avatar, họ tên, email tài khoản).
   - **Tìm**: `records/list` (217) personnel, `type: 3`, `logic_sequence` `(1 OR 2 OR 3 OR 4 OR 5) AND 6 AND 7 AND 8`: `first_last_name`/`last_first_name`/`first_name`/`last_name`/`account_email` `like` chuỗi sau `@` (rỗng = tất cả; server không phân biệt hoa/thường, dấu), `account_email not null`, `deleted != 1`, `id != <tôi>`; `fields` id, first_name, last_name, account_email, avatar; 8 dòng; chờ 150ms sau lần gõ cuối, huỷ request cũ. Đúng truy vấn của danh sách mention gốc Cogover + thêm email.
   - **Phím**: ↑/↓ chọn (vòng), Enter/Tab chèn, Esc chỉ đóng danh sách (không đóng popup; gõ tiếp cùng `@` vẫn đóng, `@` mới mở lại); bấm chuột chèn. Không ai khớp → "Không tìm thấy nhân sự" (`mention-empty`); đã có khoảng trắng mà không ai khớp → tự đóng; lỗi → "Không tìm được nhân sự: <lỗi>" (`mention-error`); đang tìm lần đầu → "Đang tìm…" (`mention-loading`). Ô soạn có `aria-expanded`/`aria-controls`/`aria-activedescendant` khi mở.
   - **Chèn**: thay `@…` bằng node mention (inline void, pill `.rte-mention`, xoá cả khối) + một khoảng trắng; tên hiển thị = `last_name first_name`.
   - **Lưu** (content của note qua 10200 như cũ) đúng span của trình soạn Cogover: `<span contenteditable="false" data-autocomplete-type="mention" data-id="<PERSONNEL_ID>" data-parent-object-id="OTDEMOTASK001" data-parent-record-id="<TASK_ID>" data-redirect="/o/task/<TASK_ID>?layoutId=LODEMOLAYOUT1&amp;activityId={record_id}" data-type="autocomplete" style="background-color: var(--gray-10, rgb(245, 245, 245)); padding: 2px 6px; border-radius: 999999px; color: var(--typography-primary, rgb(26, 26, 26));">@Họ Tên</span>`. `data-parent-object-id` và `layoutId` là Object `task` và layout chi tiết của nó trên Workspace đang phục vụ trang: khoá `task`, `taskViewLayout` trong `workspaces.ts`, `config.ts` đọc qua `WS` (Workspace gốc: layout "Xem" `LODEMOLAYOUT1`; Workspace thứ hai: `LODEMO2LAYOUT`; sửa 2026-10-13 — trước đó `TASK_VIEW_LAYOUT_ID` là một hằng chung cho mọi hostname nên mention tạo trên Workspace thứ hai ghi layout của Workspace gốc). **Không** gửi `data-mentioned` cho mention mới: backend tự gửi thông báo và thêm `data-mentioned="true"` (đã kiểm chứng 2026-10-03 trên Workspace gốc: note tạo qua 10200 và qua giao diện gốc đều được backend đánh dấu như nhau). Đọc lại span đã có `data-mentioned="true"` thì giữ nguyên (không báo lại).
   - `sanitizeForSave` chỉ giữ `<span>` là mention (thuộc tính đúng danh sách trên, style cố định, `data-redirect` phải bắt đầu `/o/`), span khác bị gỡ (giữ chữ). Hiển thị timeline: span mention chỉ giữ `data-autocomplete-type="mention"` → pill nền `--accent-soft`, chữ `--accent`. Dán HTML có mention → chỉ lấy chữ. Mô tả task có span mention gốc không còn bị khoá (pill giữ nguyên khi sửa); ô Mô tả không có danh sách `@`.
3g. **Giao lại (yêu cầu người dùng 2026-10-04)**: người được giao có thể giao task cho người khác — đổi "Người được giao" trong popup xem (sửa nhanh) hoặc trong form sửa. Quy tắc người: sau khi đổi tôi vẫn là người giao hoặc người được giao, **hoặc** tôi đang là người được giao và đổi người được giao; đổi người giao khiến tôi không còn là ai trong hai → vẫn từ chối với toast/lỗi "Bạn cần là người giao hoặc người được giao".
   - Khi người được giao đổi từ A sang B, nếu A có (không rỗng), A chưa nằm trong `ccs` và A không phải người giao (sau khi đổi) → trước khi lưu mở **hộp hỏi** (Radix AlertDialog, `data-testid="confirm-follow"`, mở sau khi danh sách chọn người đã đóng hẳn) tiêu đề "Thêm vào người theo dõi?":
     - A là tôi: "Bạn giao “<tên task>” cho <B>. Thêm bạn vào người theo dõi để vẫn thấy công việc này?" + nếu không theo dõi thì tôi không còn vai trò nào: " Nếu không, công việc sẽ không còn trong danh sách của bạn."
     - A là người khác (tôi là người giao): "“<tên task>” được giao lại cho <B>. Thêm <A> (người được giao trước) vào người theo dõi?"
     - Nút: **Huỷ** (`confirm-follow-cancel`, như Esc: không lưu gì, giữ người được giao cũ; trong form thì ở lại form), **Không** (`confirm-follow-no`: chỉ đổi người được giao), **Thêm vào theo dõi** (`confirm-follow-yes`, có focus: lưu cùng một request 10201 `assignee` + `ccs` = danh sách cũ + A). Esc chỉ đóng hộp hỏi; đóng thì focus về ô đã mở (người được giao / nút Lưu).
   - Không hỏi khi A rỗng, A đã theo dõi, hoặc A là người giao (ví dụ tôi vừa giao vừa được giao).
   - Sau khi lưu: tôi còn vai trò → toast "Đã lưu" (form: "Đã lưu “…”"); chỉ còn theo dõi → popup chuyển chế độ chỉ xem. Không còn vai trò nào → toast "Đã giao “<tên>”. Việc này không còn trong danh sách của bạn." (form: "Đã lưu “<tên>”. Việc này không còn trong danh sách của bạn."), thẻ rời danh sách, popup còn mở ở chế độ chỉ xem (ghi chú chỉ xem như với task không có vai trò: "Bạn không được giao công việc này — chỉ xem").

4. Popup xem thêm: mã task (`name`, ví dụ TAS-1034), tạo lúc, cập nhật lúc. **Bố cục chế độ xem (yêu cầu người dùng 2026-10-01):** phần thuộc tính chia **2 cột** — cột trái: Trạng thái, Mức ưu tiên, Hạn chót; cột phải: Người giao, Người được giao, Người theo dõi; "Cập nhật lúc" chuyển lên dòng meta dưới tiêu đề popup (`TAS-xxxx · Tạo lúc … · Cập nhật lúc …`). Popup hẹp (< ~720px, gồm mobile) về 1 cột theo thứ tự trên. Phần Mô tả trải **hết bề rộng** nội dung popup (bỏ giới hạn 80ch), ảnh `max-width:100%`.
5. Xoá (cập nhật theo người dùng 2026-10-01; 2026-10-04 bỏ nút xoá trên thẻ): bấm "Xoá công việc" (`form-delete`) trong popup xem → mở **hộp xác nhận** (Radix AlertDialog, `data-testid="confirm-delete"`, tiêu đề "Xoá công việc?", nội dung nêu tên task và "sẽ bị xoá vĩnh viễn khỏi Cogover", nút `confirm-delete-cancel` "Huỷ" (focus mặc định) và `confirm-delete-ok` "Xoá" kiểu nguy hiểm). Huỷ/Esc → không làm gì. Xác nhận → gọi API xoá **ngay**, thành công thì bỏ khỏi danh sách (đóng popup nếu đang mở) và toast "Đã xoá “…”" (không còn Hoàn tác, không còn xoá trễ 5 giây/`pagehide`); lỗi → giữ task, toast lỗi.
6. Đã xong tải theo trang + nút "Tải thêm" (mục 4).
8. **Phím tắt → menu Trợ giúp (yêu cầu người dùng 2026-10-01):** bỏ khối "Phím tắt" khỏi sidebar trái. Thêm nút icon trợ giúp (lucide `CircleHelp`, cùng kiểu với nút theme, `aria-label="Trợ giúp"`, `title="Phím tắt"`, `data-testid="help-toggle"`, `aria-expanded`) đặt **ngay cạnh trái nút đổi theme** trên topbar. Bấm mở Radix Popover (`data-testid="help-menu"`, tiêu đề "Phím tắt") liệt kê đúng các phím tắt hiện có (N Tạo công việc, / Tìm kiếm, T Đổi sáng / tối, Esc Đóng hộp thoại…) với `<kbd>`; đóng bằng Esc/click ra ngoài/bấm lại nút, focus trả về nút. Không transition. Vừa topbar ở 375px.
7. Trạng thái tải/lỗi/rỗng/phiên hết hạn.

Chế độ xem (2026-10-01, thay bố cục 2 cột trước đó): thuộc tính cũng gọn **2 hàng**, cùng lưới với form (nhãn bên trái, cột nhãn đầu thẳng hàng) — hàng 1: Trạng thái · Mức ưu tiên · Hạn chót (dạng ngắn `CN, 04/10/2026 14:00` (thứ viết tắt T2…T7, CN) + chip "Còn N ngày"/"Quá hạn N ngày"; ngày đầy đủ trong `title`); hàng 2: Người giao · Người được giao · Người theo dõi (nhiều người: avatar chồng + tên người đầu + "+N", `title` liệt kê đủ tên; không có → "Không có"). Popup < ~900px cho phép xuống dòng; < 720px → 1 cột.

Đầu popup chế độ xem (2026-10-01): **bỏ tiêu đề "Chi tiết công việc"**; dòng meta (`task-meta`) đưa lên hàng đầu popup, bên trái, cùng hàng với các nút icon Sửa · Xoá · ✕ bên phải; thời gian **ngắn gọn**: `TAS-1005 · Tạo 09:12 30/09 · Cập nhật 09:13 30/09` (khác năm hiện tại thì thêm năm `30/09/2025`; cập nhật cùng ngày với tạo vẫn ghi đủ ngày), thời gian đầy đủ trong `title`. Tên task (chữ lớn bên dưới) là `Dialog.Title` (accessible name của popup = tên task). Popup tạo/sửa giữ tiêu đề "Tạo công việc"/"Sửa công việc".

File đính kèm (2026-10-01): **form tạo/sửa** — góc trái chân popup (cùng hàng nút Huỷ/Lưu) có nút **"Đính kèm"** (lucide `Paperclip`, `data-testid="attach-button"`, input file ẩn `attach-input` chọn nhiều file) và danh sách chip file (`attach-chip`, `data-state="uploading|done|error"`, icon theo loại, tên rút gọn + dung lượng, nút ✕ `attach-remove`; lỗi có `title` lý do); có thể kéo-thả file vào popup; đang upload thì nút Lưu/Tạo bị vô hiệu kèm chữ "Đang tải file…"; nhiều chip thì xuống dòng gọn trong khu vực trái chân popup. **Chế độ xem** — hàng **"Đính kèm"** ngay dưới hàng người (trên đường kẻ trước Mô tả), cùng lưới nhãn trái: chip file bấm được (`attachment-link`, mở `/files/<file_id>/original/<fileName>` tab mới, `rel=noopener`), không có file thì ẩn hàng. Task chỉ theo dõi xem/tải được, không sửa.

Nút popup chế độ xem (2026-10-01): **bỏ chân popup** (không còn nút "Đóng" `form-cancel` ở chế độ xem); nút **Sửa** (`form-edit`, icon lucide `Pencil`, `aria-label`/`title` "Sửa") và **Xoá** (`form-delete`, icon `Trash2`, `aria-label`/`title` "Xoá công việc", hover đỏ) là nút icon ở **góc trên bên phải, ngay bên trái nút đóng ✕** (`dialog-close`), cùng cỡ với nút ✕; task chỉ theo dõi thì không hiện hai nút này. Chế độ sửa/tạo: ẩn hai nút icon, chân popup giữ "Huỷ" (`form-cancel`) và "Lưu"/"Tạo công việc" (`form-submit`). Đóng popup xem bằng ✕ hoặc Esc. **Bấm ra ngoài popup không đóng** — áp dụng cho cả xem, tạo và sửa (yêu cầu 2026-10-02; trước đó bấm ra ngoài đóng popup, làm mất nội dung đang nhập). Popover nhập liên kết của mô tả có nút ✕ `rte-link-close` (aria-label "Đóng", title "Đóng (Esc)") đóng như Esc, không áp dụng liên kết. Avatar người (ảnh và chữ cái đầu) hình tròn (2026-10-02).

Form tạo/sửa (2026-10-01): khu vực thuộc tính gọn còn **2 hàng**, nhãn bên trái ô, ô cao 36px — hàng 1: Trạng thái (Select) · Mức ưu tiên (**Select** shadcn, option có icon cờ màu tone, nhãn Khẩn cấp/Cao/Trung bình/Thấp) · Hạn chót (nút ngày + Select giờ); hàng 2: Người giao · Người được giao (Combobox, mỗi ô nửa hàng). Popup < 720px → 1 cột, nhãn trên ô.

Thay đổi giao diện người dùng duyệt khi review local (2026-10-01): ảnh nền là **ảnh chụp** `app/src/assets/bg-default.webp` (WebP q50, ~193 KB) trên lớp cố định `body::before`, theme tối phủ lớp tối 55% — không còn SVG có filter; khung chính **đặc** (`--board-alpha:1`, đã thử trong suốt rồi bỏ); popup tạo/xem trên desktop cách mép cửa sổ 64px trên/dưới và 32px hai bên (nằm trong khung app); nút topbar 36px; cột Người giao chỉ avatar căn giữa tiêu đề cột (avatar Người giao / Giao cho trên thẻ 30px — 2026-10-08); meta (2026-10-04) 5 cột 120/88/88/64/84px gap 8px: Trạng thái · Người giao · Giao cho (avatar) · Ưu tiên (chỉ cờ màu tone 28px, nhãn ở title "Ưu tiên: Cao", hiện chữ khi dòng meta xuống hàng) · Hạn chót (icon + chữ tối đa 2 dòng, ví dụ "Quá hạn / hôm nay"; một dòng khi xuống hàng); thẻ không còn cột nút xoá; popup dùng div scrim thay `Dialog.Overlay` (không khoá body ở desktop).

Giữ nguyên mọi thứ khác của mẫu: token màu sáng/tối, font stack `Inter, -apple-system, "system-ui", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`, bo góc 4px, **không transition/animation**, max-width 1600px, app-shell (chỉ panel danh sách cuộn) và padding 32px trên/dưới ở desktop, mobile ≤880px, container query ≤980px, bộ lọc nhanh có số đếm, lọc hạn (Tất cả, Quá hạn, Hôm nay, Ngày mai, Tháng này, Tuỳ chọn từ–đến), sắp xếp (Ưu tiên mặc định Cao→thấp, Hạn chót, Ngày tạo, Trạng thái, Tiêu đề; nút đổi chiều có nhãn như mẫu), ô tìm kiếm (không dấu), chip tổng hợp người giao bên phải tiêu đề danh sách, nút theme, nút Tạo công việc mở popup ngay (rộng 1120px, cao gần sát trên dưới với khoảng 32px), click vùng trống thẻ → popup xem, nút Sửa → chế độ sửa → Lưu, Huỷ/Esc ở chế độ sửa → về xem, Esc ở chế độ xem → đóng, double-click tiêu đề → sửa nhanh (Enter/blur lưu, Esc huỷ, rỗng giữ tên cũ), đổi trạng thái làm task rời bộ lọc thì trễ 600ms + toast Hoàn tác. Ghi nhớ view (bộ lọc, sắp xếp, vai trò) và theme trong `localStorage` (bọc try/catch).

**Cỡ chữ (2026-10-04, người dùng yêu cầu):** một cỡ **13.5px** (`--fs`) cho mọi chữ của cả hai app: nhãn, nút, ô nhập, thẻ việc, cây ghi chú, popup, menu, toast, nội dung mô tả / ghi chú / bình luận, phần shadcn (`text-xs` / `text-sm` / `text-base` trỏ về `--fs`). Riêng **`h1`, `h2` 20px** (`--fs-h`): tên app ở đầu cột trái (`h1.brand` "Công việc" / "Ghi chú"), tiêu đề danh sách, tiêu đề popup, tiêu đề ghi chú, tiêu đề form, `h1`/`h2` trong nội dung (h3–h6 13.5px đậm). Chữ cái trong avatar giữ cỡ theo vòng tròn. Không còn `font-size` số cứng nào khác trong CSS.

## 6. Quy ước selector cho E2E

Ưu tiên role + accessible name tiếng Việt như mẫu; ngoài ra các `data-testid` sau là contract (đổi tên thì cập nhật contract và test cùng lúc):

| data-testid | Phần tử |
|---|---|
| `app-loading`, `app-error`, `app-retry`, `session-expired` | trạng thái tải / lỗi / nút thử lại / phiên hết hạn |
| `quick-open`, `quick-all`, `quick-done` + `count-open`, `count-all`, `count-done` | bộ lọc nhanh + số đếm |
| `due-filter-<all|overdue|today|tomorrow|month|custom>`, `due-from`, `due-to` | lọc hạn |
| `role-filter-all`, `role-filter-reporter`, `role-filter-assignee`, `role-filter-cc` | checkbox vai trò (Tất cả / Tôi giao / Giao cho tôi / Tôi theo dõi); "Tất cả" = cả ba vai trò (có lại từ 2026-10-04) |
| `prio-filter-all`, `prio-filter-<urgent|high|medium|low>` | checkbox mức ưu tiên (Tất cả / Khẩn cấp / Cao / Trung bình / Thấp) |
| `dock`, `dock-app-<id>` (kèm `data-running`) | dock và icon app (`dock-app-cong-viec`) |
| `win-close`, `win-minimize`, `win-maximize` | nút cửa sổ macOS (đóng / thu nhỏ / phóng to toàn màn hình) |
| `mention-popover`, `mention-list`, `mention-option` (kèm `data-person-id`), `mention-empty`, `mention-loading`, `mention-error` | danh sách `@` trong ghi chú; pill trong editor `.rte-mention` (kèm `data-person-id`), trong timeline `[data-autocomplete-type="mention"]` |
| `sort-by`, `sort-dir-desc`, `sort-dir-asc` | sắp xếp |
| `search` | ô tìm kiếm |
| `theme-toggle` | nút theme (`aria-pressed` hoặc `data-theme` trên `<html>`) |
| `help-toggle`, `help-menu` | nút Trợ giúp cạnh nút theme + popover Phím tắt |
| `open-create` | nút Tạo công việc |
| `list-title`, `list-count` | tiêu đề danh sách |
| `task-item` (kèm `data-task-id="<recordId>"`, `data-status="<slug>"`, `data-readonly="true|false"`) | mỗi thẻ |
| `task-checkbox`, `task-title`, `title-edit`, `task-status`, `task-reporter`, `task-assignee`, `task-priority`, `task-due`, `task-role` | trong thẻ (`task-delete` đã bỏ 2026-10-04) |
| `empty-state`, `empty-reset`, `load-more`, `done-progress` | rỗng / đặt lại / tải thêm / chú thích đã tải |
| `task-dialog` (Radix Dialog content), `task-view`, `task-form` | popup, chế độ xem, form |
| `field-title`, `field-title-error`, `field-desc`, `field-due-date`, `field-due-time`, `field-priority` (Select trigger — thay cho `field-priority-<slug>` từ 2026-10-01), `field-status`, `field-reporter`, `field-assignee`, `field-people-error` | trường form |
| `person-option` (kèm `data-person-id`) | lựa chọn trong ô chọn nhân sự |
| `form-submit`, `form-cancel`, `form-edit`, `form-delete`, `dialog-close` | nút popup |
| `toast`, `toast-undo` | toast + Hoàn tác |
| `confirm-delete`, `confirm-delete-ok`, `confirm-delete-cancel` | hộp xác nhận xoá |
| `confirm-follow`, `confirm-follow-yes`, `confirm-follow-no`, `confirm-follow-cancel` | hộp hỏi thêm người được giao cũ vào người theo dõi khi giao lại (3g) |
| `side-toggle`, `side-resizer` | nút ẩn/hiện cột trái và tay kéo đổi độ rộng (1d, chỉ ≥ 881px) |

## 7. Tiêu chí nghiệm thu (mỗi tiêu chí ≥ 1 test E2E)

- **AC1** Mở `/_cm_5/index.html` khi đã đăng nhập → hiện "Chưa xong" (đổi từ "Tất cả chưa xong" theo yêu cầu 2026-10-01) với task mở trong phạm vi; asset tải từ `/_cm_5/assets/`; không lỗi console/network ngoài dự kiến.
- **AC2** Loading khi đang tải; rỗng khi không có việc phù hợp (kèm "Đặt lại bộ lọc" khi đang lọc); lỗi API → `app-error` + Thử lại; 401/403 → `session-expired`.
- **AC3** Bộ lọc nhanh + số đếm đúng (theo vai trò đang tick); tiêu đề danh sách đổi theo.
- **AC4** Lọc hạn đúng theo UTC+7 (gồm khoảng tuỳ chọn).
- **AC5** Vai trò chọn nhiều: mặc định chỉ "Giao cho tôi"; tick/bỏ tick từng mục lọc theo OR; "Tất cả" = cả ba (ba chip hiện không tick), từ "Tất cả" bấm một vai trò → chỉ vai trò đó, tick đủ ba hoặc bỏ tick vai trò cuối → "Tất cả"; view cũ `roles: []` → rỗng "Chưa chọn vai trò nào" + Đặt lại về mặc định; số đếm và truy vấn đã xong theo vai trò; refresh giữ lựa chọn.
- **AC6** Sắp xếp 5 trường × 2 chiều; mặc định Ưu tiên Cao→thấp.
- **AC7** Tìm kiếm không dấu theo tiêu đề, mô tả (text), tên người giao.
- **AC8** Tick → `resolved`, gạch ngang, rời "chưa xong" sau ~600ms + toast Hoàn tác; Hoàn tác khôi phục (cả trên server); bỏ tick → trạng thái trước/`new`. Đọc lại record bằng API khớp.
- **AC9** Đổi trạng thái bằng select trên thẻ → lưu server.
- **AC10** Tạo: validate tiêu đề, hạn, người; "Người theo dõi" (`field-ccs`, chọn nhiều, trống hiện "Mặc định của Workspace") → chọn thì gửi `ccs` = mảng ID, trống thì không gửi `ccs`; tạo thành công → hiện trong danh sách (tự nới bộ lọc nếu bị ẩn) và record đọc lại khớp `subject/description/due_date/priority/status/reporter/assignee`.
- **AC11** Popup: xem → Sửa → Lưu (server cập nhật, quay về xem); Huỷ/Esc khi sửa → về xem không lưu; Esc khi xem → đóng.
- **AC12** Double-click tiêu đề: Enter/blur lưu, Esc huỷ, rỗng giữ cũ. Đang sửa nhanh mà bấm ra ngoài ô sửa (vùng trống của chính thẻ đó hoặc thẻ khác) → chỉ thoát chế độ sửa (lưu như blur), **không mở popup chi tiết** từ cú bấm đó; cú bấm sau đó mở popup bình thường. Trong lúc đang sửa nhanh, rê chuột lên vùng thẻ (thẻ khác hoặc vùng trống của chính thẻ đó, kể cả tiêu đề các thẻ khác) hiện **con trỏ mũi tên mặc định** thay vì bàn tay/chữ I; các điều khiển (checkbox, chọn trạng thái, nút xoá) giữ con trỏ riêng; thoát sửa xong thì trở lại bàn tay (vùng thẻ) và chữ I (tiêu đề).
- **AC13** Xoá có xác nhận (từ `form-delete` trong popup; thẻ không có nút xoá): Huỷ/Esc → không gọi API, task còn nguyên; Xác nhận → gọi API xoá ngay, task biến mất, record không còn trên server; lỗi API → task vẫn còn + báo lỗi.
- **AC14** Task chỉ theo dõi: mọi thao tác ghi bị vô hiệu (chỉ test bằng dữ liệu mock — tạo fixture thật sẽ gửi thông báo cho người thật).
- **AC15** Theme sáng/tối + nhớ lựa chọn; ảnh nền đổi theo theme.
- **AC16** Bàn phím: Tab tới thẻ, Enter mở popup, focus nằm trong popup, Esc theo AC11.
- **AC17** Responsive: desktop chỉ panel danh sách cuộn; 375px không cuộn ngang.
- **AC18** Mô tả HTML được sanitize (không chạy `<script>`/`onerror`); mô tả có định dạng không bị ghi đè khi sửa.
- **AC19** Refresh giữ bộ lọc/sắp xếp; deep-link `#/task/<id>` mở popup task đó.
- **AC20** Đã xong: tải theo trang, "Tải thêm" khi còn.
- **AC26** Quy trình trạng thái: có rule → Select ở thẻ/popup/form sửa chỉ hiện trạng thái hiện tại + bước được phép, form tạo chỉ `new`; checkbox khoá kèm lý do khi không được tick/bỏ tick; không có Hoàn tác khi không có bước ngược; server từ chối → thông báo tiếng Việt + trả giá trị cũ; không đọc được rule → hiện đủ 7 trạng thái. (AC8/AC9 trên Workspace chạy với các bước hợp lệ của rule: tick in_progress→resolved, select new→in_progress.)
- **AC23** Activities: popup xem tải timeline theo `Task` (15/lần, Xem thêm), hiển thị người tạo/loại/chủ đề/thời gian/nội dung (ảnh hiện được), rỗng/lỗi/thử lại; thêm ghi chú (chỉ nội dung, focus ngay khi mở, bắt buộc; dán ảnh → `_attachments` của activity) → request 10200 trên `activity` đúng field, ghi chú mới hiện đầu timeline và đọc lại khớp (Workspace).
- **AC24** Sửa nhanh trong popup xem: trạng thái, ưu tiên, hạn chót (ngày + giờ), người giao, người được giao, người theo dõi lưu ngay (10201 chỉ field đổi, `ccs` mảng ID hoặc `null`), thẻ cập nhật; lỗi → hoàn lại; vi phạm quy tắc người giao/được giao → không gửi; task chỉ theo dõi không có điều khiển.
- **AC27** Mức ưu tiên: mặc định "Tất cả"; tick một/vài mức lọc theo OR, đủ 4 mức → "Tất cả"; không đổi số đếm bộ lọc nhanh; badge + Đặt lại; nhớ qua refresh.
- **AC28** Desktop: dock bên trái có "Công việc" đang chạy; Thu nhỏ ẩn cửa sổ giữ trạng thái, icon dock mở lại không tải lại; Đóng gỡ cửa sổ (mất chấm), icon dock mở lại và tải lại; Phóng to phủ kín trang, ẩn dock, nhớ qua refresh, bấm lại về cửa sổ.
- **AC31** Cột trái (2026-10-04, ≥ 881px): kéo tay kéo đổi độ rộng (kẹp 220–420, lưu khi thả), ←/→/Shift/Home/End, bấm đúp về 256; nút ẩn → 1 cột, ba nút cửa sổ + "Hiện cột trái" lên đầu topbar trước ô tìm kiếm, focus theo nút; ⌘/Ctrl+\ ẩn/hiện; refresh giữ độ rộng và trạng thái ẩn; giá trị lưu lạ → mặc định; ≤ 880px bỏ qua trạng thái ẩn, không có nút/tay kéo.
- **AC30** Giao lại (2026-10-04): người được giao đổi người được giao (popup xem hoặc form sửa) → hộp "Thêm vào người theo dõi?" (focus "Thêm vào theo dõi"); Thêm → một request `assignee` + `ccs` có tôi; Không → chỉ `assignee`, thẻ rời danh sách + toast "…không còn trong danh sách của bạn"; Huỷ/Esc → không gửi gì, giữ người cũ (form: ở lại form); người giao đổi người được giao → hỏi thêm người cũ; tôi vừa giao vừa được giao → không hỏi; đổi người giao làm tôi không còn vai trò → vẫn báo lỗi.
- **AC29** @mention trong ghi chú: gõ `@` + tên/email → danh sách đúng truy vấn (có tài khoản, không phải tôi, chưa xoá); ↑/↓/Enter/Tab/chuột chèn pill; Esc chỉ đóng danh sách; không khớp/lỗi có thông báo; note lưu đúng span gốc Cogover (không `data-mentioned`), timeline hiện pill; ô Mô tả không có `@`. Workspace: mention chính persona trên task `[E2E]` → đọc lại content có `data-mentioned="true"`.
- **AC25** Form rộng (≥ 920px nội dung): người giao kết thúc thẳng ưu tiên, hạn chót bắt đầu thẳng người được giao, dòng 1 không xuống dòng.
- **AC22** Dán vào mô tả (2026-10-02): HTML kiểu Google Docs/Word giữ tiêu đề, đậm/nghiêng/gạch, danh sách lồng/số; ảnh `data:` và ảnh dán dạng file upload vào `_attachments` (field_id/object_id) rồi hiện từ `/files/0/…&long_text_field_id=OFDEMOTASKDSC`; nút lưu khoá khi đang tải ảnh; tạo task → `_attachments` + `description` khớp, ảnh tải về được (Workspace); upload lỗi → ảnh bị gỡ + `desc-images-error`; ảnh link web giữ link. Popup xem/tạo/sửa không đóng khi bấm ra ngoài; popover liên kết có nút ✕; avatar tròn.
- **AC21** Đính kèm (2026-10-01): ảnh PNG/JPG và tài liệu upload được, tạo/sửa task lưu đúng `attachment_files`, link tải về đúng nội dung (Workspace); file đuôi bị server từ chối → chip lỗi + dòng lý do tiếng Việt, bấm Lưu không gửi request ghi và hiện `form-error`, bỏ file lỗi thì lưu được; file > 50 MB bị từ chối không upload, đúng 50 MB thì upload; quá 10 file mỗi công việc (gồm file đã có) bị bỏ qua kèm `attach-note`.

## 8. Dữ liệu test trên Workspace

Bộ E2E trong repo chạy trên bản build với API giả lập (`e2e/tests/local`). Nếu chạy thêm test trên Workspace thật: dùng một persona riêng, mọi bản ghi tạo ra có tiền tố `[E2E] `, gán cho chính persona đó (không tạo việc gán cho người thật), ghi lại ID và xoá hết sau khi chạy, không sửa / xoá bản ghi không có tiền tố.

## 9. App "Ghi chú" (thêm 2026-10-04)

SPA `_cm_5` có hai app trên cùng desktop: **Công việc** (mục 1–8) và **Ghi chú**. Cả hai cùng bản publish.

### 9.1 Desktop nhiều cửa sổ

- Dock: `dock-app-cong-viec`, `dock-app-ghi-chu` (icon vàng). Mỗi app một cửa sổ (`open` / `minimized` / `closed`). **Mỗi lúc hiện một cửa sổ**: mở app từ dock thì cửa sổ đang ở trước bị thu nhỏ (giữ trạng thái, tắt phím tắt như khi thu nhỏ). `.desktop[data-front]` = app đang ở trước; `data-window` = `open` nếu có cửa sổ ở trước, `minimized` nếu chỉ còn cửa sổ thu nhỏ, `closed` nếu không còn gì.
- Đóng = gỡ cửa sổ (mở lại tải từ đầu); phóng to dùng chung cho mọi cửa sổ (`cong-viec.window`).
- Mở trang với `#/note/<id>` → cửa sổ Ghi chú mở trước (Công việc chờ trong dock). Link `#/note/…` mở khi Công việc đang ở trước → Ghi chú lên trước; link `#/task/…` mở khi Ghi chú đang ở trước → Công việc lên trước (kèm popup task).
- **URL theo cửa sổ ở trước** (refresh về đúng chỗ): `?app=<slug>&q=<từ khoá>#/<mục>`; slug tiếng Anh: `tasks` (Công việc), `notes` (Ghi chú) — id nội bộ `cong-viec` / `ghi-chu` (dock, `data-front`, test id) giữ nguyên. Ví dụ `?app=notes&q=publish#/note/<id>`, `?app=tasks#/task/<id>`. Cửa sổ ở trước ghi bằng `history.replaceState` (không thêm lịch sử), giữ các tham số khác của URL; `q` bỏ khi rỗng và chỉ ghi sau khi ngừng gõ 400ms; chuyển app thì URL đổi theo app mới (không còn sót link của app kia). Tải trang: app của link mục (`#/note/` → Ghi chú, `#/task/` → Công việc) thắng, rồi `?app=` (slug lạ, kể cả `cong-viec` / `ghi-chu`, bỏ qua), mặc định Công việc; `q` chỉ dùng cho app ghi nó (không có `?app=` = Công việc). Đóng cửa sổ ở trước → bỏ `app`, `q`, hash (refresh mở Công việc). Bộ lọc, sắp xếp, vai trò, bộ lọc nhanh của Ghi chú, thư mục đang mở vẫn nhớ trong `localStorage`; form tạo/sửa đang mở không được giữ qua refresh.
- Ghi chú và Cài đặt là chunk riêng (lazy). **Tải trước khi rảnh (2026-10-04):** Desktop tải code của các cửa sổ lazy khi trình duyệt rảnh sau lúc mở trang (`requestIdleCallback`, tối đa 5 s; không có thì sau 2 s) → lần đầu mở sau refresh hiện ngay, không qua màn chờ. Mở trước khi tải xong → **khung chờ** chính là cửa sổ đó (`window-frame`: nút cửa sổ, `h1.brand` icon dock + tên app, top bar trống cao như app, ô chờ `window-loading` giống hệt ô chờ dữ liệu của app), app tải xong thì thay vào không nhảy.
- **Ô chờ dữ liệu thống nhất:** cả ba app dùng cùng `LoadingState` (icon, tiêu đề, dòng phụ, khung nét đứt như mẫu): Công việc "Đang tải công việc…" (`app-loading`), Ghi chú "Đang tải ghi chú…" (`notes-loading`), Cài đặt "Đang tải thiết lập…" (`settings-loading`, thay cho cả khung nội dung khi đang tải).

### 9.2 Object (xem thêm `objects/README.md`)

| Object | ID | Field |
|---|---|---|
| `notes_cat` (thư mục) | `OTDEMONOTECAT` | `name`, `parent_folder` (→ notes_cat), `owner` (→ personnel) |
| `notes_content` (ghi chú) | `OTDEMONOTECON` | `name`, `folder` (→ notes_cat), `owner`, `content` (long text 3 định dạng: `{"text_type":1|2|3,"value":…}`), `visibility` (`private` mặc định / `shared` / `public`), `viewers`, `editors` (→ personnel, nhiều), `viewer_departments`, `editor_departments` (→ department, nhiều), `tags` (→ notes_tag, nhiều) |
| `notes_tag` | `OTDEMONOTETAG` | `name` (ai cũng tạo được) |
| `notes_pin` | `OTDEMONOTEPIN` | `name` (auto), `person`, `note` (reference → xoá ghi chú thì xoá ghim), `order` |

- Phòng của tôi: `department_personnel` (`personnel` = `$currentUser` → `department`). Danh sách phòng: `department` (bỏ `deleted`, `is_active = false`).
- `content` đọc về là chuỗi JSON (hoặc object); rỗng gửi `{"text_type":1,"value":null}`. Không ghi field ẩn `_hidden_content`. `notes_content` không có `_attachments` → trình soạn không nhận dán ảnh.

### 9.3 Quy tắc

- **Thư mục là của riêng từng người** (chỉ owner thấy). Cây = thư mục cha → con → cháu… của tôi + ghi chú của tôi; ghi chú không thư mục (hoặc thư mục mất) nằm ở gốc. Thư mục mồ côi / vòng lặp → gốc.
- **Được chia sẻ** = `visibility = shared` AND (tôi trong `viewers`/`editors` OR phòng của tôi trong `viewer_departments`/`editor_departments`), không phải ghi chú của tôi; hiện thành nhóm theo người chia sẻ (không nằm trong cây của họ). `private` bỏ qua 4 danh sách dù có giá trị. `public` = cả Workspace đọc được nhưng **không** đưa vào danh sách của người khác (chỉ mở bằng link).
- Quyền: owner xem/sửa/xoá/chia sẻ/chuyển thư mục; người (hoặc phòng) trong `editors` sửa được tiêu đề/nội dung/thẻ khi `shared` (không chuyển thư mục, không chia sẻ, không xoá); còn lại chỉ xem. App chỉ ẩn nút; quyền thật do security rule trên Workspace.
- **Security rule khuyến nghị**: mỗi object 4 rule `[Notes] - …`: Tạo (type 1) mọi nhân sự, mọi trường; Xem / Sửa / Xoá (type 2) chỉ bản ghi do mình tạo (`created_by`). Hệ quả: chia sẻ / công khai trong app **chưa có tác dụng** với người khác (họ không đọc được bản ghi), thẻ là của riêng từng người. Muốn bật chia sẻ thì thêm rule Xem/Sửa theo `visibility` + `viewers` / `editors` / phòng.
- Xoá thư mục chỉ khi trống (không ghi chú, không thư mục con). Xoá ghi chú hỏi xác nhận.
- **Kéo thả trong cây (2026-10-04):** kéo thư mục của tôi thả lên thư mục khác → thành thư mục con (`parent_folder`); thả lên dải "Thư mục" (hiện ô "Thả vào đây để đưa ra thư mục gốc" `tree-root-drop` khi đang kéo) → về gốc (`parent_folder: null`); kéo ghi chú của tôi thả lên thư mục → `folder` (thả lên dải đầu → không thư mục). Không cho thả thư mục vào chính nó / thư mục con của nó, hay vào nơi đang ở (ô đích không xanh, thả không ghi gì). Chỉ cây của tôi (không kéo mục được chia sẻ, mục đã ghim). Kéo bằng pointer chuột (nhấn rồi di 5px), có nhãn đi theo con trỏ (`drag-ghost`), ô đích xanh (`data-drop-target="ok"`), rê lên thư mục đang thu gọn 0,7 s thì mở ra, gần mép trên/dưới cột trái thì cuộn; Esc huỷ; bấm không di là click thường. Xong → toast "Đã chuyển thư mục “X” vào “Y”" / "ra thư mục gốc" / "Đã chuyển “Ghi chú” vào “Y”".

### 9.4 API (records API như mục 4; `object_type` = ID object tương ứng)

- Tải: `getMe` → song song thư mục của tôi (`owner = $currentUser`, sort `name`), ghi chú của tôi (`owner = $currentUser`, sort `updated` desc), ghim của tôi (`person = $currentUser`, sort `order`), thẻ (`id not null`), phòng của tôi → rồi ghi chú được chia sẻ (type 3, `1 AND (2 OR 3[ OR 4 OR 5])`). Lỗi ở danh sách được chia sẻ không chặn phần của tôi.
- Ghi: tạo ghi chú (`name`, `folder`, `content`, `tags`, `owner` = tôi, `visibility` = private) → đọc lại theo id; sửa (`name`, `folder`, `content`, `tags`); chia sẻ (`visibility` + 4 danh sách, rỗng → `null`); xoá; thư mục (`name`, `parent_folder`, `owner`); ghim (`note`, `order` = lớn nhất + 1, `person`); thẻ (`name`).

### 9.5 Giao diện

- **Form soạn (2026-10-04):** rộng tối đa 1440px; Thư mục · Định dạng · Thẻ cùng một hàng (chỉ xuống hàng khi cửa sổ quá hẹp). Ô **Nội dung** cao hết phần còn lại tới cách mép dưới cửa sổ 24px (tối thiểu 240px), viết dài thì **cuộn bên trong ô** (rich text, Markdown, thuần, xem trước); nút **Phóng to** (`note-expand`, cạnh nhãn Nội dung) cho ô nội dung phủ cả cửa sổ Ghi chú với tiêu đề ghi chú + nút Lưu ở trên (`note-body[data-expanded]`), **Thu nhỏ** hoặc Esc để về, nội dung giữ nguyên. Danh sách **Thư mục** có mục cuối **"＋ Tạo thư mục mới…"** → popup "Thư mục mới" (`new-folder-dialog`: tên bắt buộc, "Nằm trong" mặc định là thư mục đang chọn) → tạo `notes_cat` của tôi rồi chọn luôn thư mục đó cho ghi chú; Huỷ thì giữ thư mục đã chọn. **Hộp Chia sẻ:** ba lựa chọn hiển thị chỉ có icon 20px (không ô nền), căn giữa theo chiều cao lựa chọn, icon màu nhấn khi đang chọn. Viền focus chỉ khi dùng bàn phím (bấm chuột chỉ có viền xanh của lựa chọn). Nút **Chia sẻ** trên trang ghi chú **xanh** (`data-on`) khi ghi chú đang `shared` / `public` (tên: "Chia sẻ (đang chia sẻ cho người / phòng)" / "Chia sẻ (đang công khai)").

- Cột trái (cùng khung Công việc, co giãn/ẩn như 1d, key `ghi-chu.side`, mặc định 300px): bộ lọc nhanh **Cá nhân / Được chia sẻ / Tất cả** (số đếm, nhớ `ghi-chu.scope`), **Đã ghim** (theo bộ lọc, tối đa 3 dòng mỗi tên), **Thư mục** (nút Tạo thư mục trong thư mục đang mở, Mở rộng/Thu gọn tất cả; cây dùng bàn phím ↑↓→←Home/End/Enter/F2; tên dài tối đa 3 dòng; menu ⋯ của thư mục: Ghi chú mới trong thư mục này / Thư mục con mới / Đổi tên / Xoá; bấm đúp tên thư mục để đổi tên), **Được chia sẻ** (nhóm theo người).
- Topbar: ô tìm (không dấu, theo tiêu đề / nội dung / tên thẻ; cây chỉ còn ghi chú khớp + thư mục cha, thư mục khớp tên giữ mọi ghi chú; tô vàng chỗ khớp), theme, "Ghi chú mới". Phím tắt (cửa sổ ở trước, ngoài ô nhập): `/` tìm, `N` ghi chú mới.
- Xem ghi chú: đường dẫn thư mục (bấm → mở tới thư mục trong cây) hoặc "Được chia sẻ bởi …", tiêu đề, nút Mục lục (chỉ khi ≥ 2 tiêu đề h1–h3 và đủ chỗ, mặc định tắt, nhớ `ghi-chu.toc`) / Ghim / Sao chép liên kết / Chia sẻ (owner) / Sửa (owner, editor) / Xoá (owner); owner, quyền xem, cập nhật lúc/bởi, định dạng; thẻ; nội dung sanitize (Markdown GFM qua `marked`, văn bản thuần giữ xuống dòng). Nội dung rộng tối đa 1040px.
- Soạn: tiêu đề (bắt buộc), thư mục (owner), định dạng (Văn bản định dạng = trình soạn Plate của Công việc / Markdown có Xem trước / Văn bản thuần; đổi định dạng chuyển nội dung), thẻ (chọn hoặc tạo thẻ mới), Lưu (⌘/Ctrl+Enter) / Huỷ.
- Chia sẻ (owner): Riêng tư / Chia sẻ cho người hoặc phòng / Công khai trong Workspace; thêm người hoặc phòng (tìm không dấu), mỗi dòng Có thể xem / Có thể sửa, bỏ; danh sách chỉ dùng được khi "Chia sẻ"; Sao chép liên kết; bấm ngoài không đóng.
- ≤ 880px: mỗi lúc một khung (cột trái hoặc ghi chú, nút ‹ quay lại).
- Link: `#/note/<id>`; ghi chú không có trong danh sách → đọc theo id (công khai, mới được chia sẻ); không thấy → toast "Không tìm thấy ghi chú này hoặc bạn không có quyền xem.".

### 9.6 data-testid

| data-testid | Phần tử |
|---|---|
| `notes-app` | trang của cửa sổ Ghi chú |
| `notes-loading`, `app-error`, `app-retry`, `session-expired`, `notes-welcome` | trạng thái |
| `scope-<mine|shared|all>`, `scope-count-<…>` | bộ lọc nhanh |
| `pinned-note` | mục Đã ghim |
| `notes-tree` (role tree), `folder-item` / `note-item` (role treeitem, `data-id`, `aria-label`), `folder-menu`, `folder-name-input`, `new-folder`, `expand-all`, `collapse-all`, `tree-empty` | cây |
| `shared-section`, `shared-group`, `shared-note` (`data-id`), `shared-empty` | được chia sẻ |
| `notes-search`, `notes-theme`, `notes-new`, `notes-back`, `notes-totals` | topbar / chân cột |
| `note-view` (`data-note-id`), `note-title`, `note-content`, `note-empty`, `note-tags`, `note-owner`, `note-visibility`, `shared-by`, `crumb`, `toc-toggle`, `toc`, `note-pin`, `note-copy-link`, `note-share`, `note-edit`, `note-delete` | xem ghi chú |
| `note-editor`, `note-title-input`, `note-folder`, `note-format`, `note-rich`, `note-text`, `md-preview`, `md-preview-body`, `tag-picker`, `tag-chip`, `tag-add`, `tag-search`, `tag-option`, `tag-create`, `note-save`, `note-cancel`, `note-error` | soạn |
| `share-dialog`, `share-vis-<private|shared|public>`, `share-add`, `share-search`, `share-option-person`, `share-option-department`, `share-entry` (`data-kind`), `share-role`, `share-remove`, `share-copy`, `share-cancel`, `share-save`, `share-close`, `share-error` | chia sẻ |
| `notes-confirm`, `notes-confirm-ok`, `notes-confirm-cancel` | xác nhận xoá |

### 9.7 Tiêu chí nghiệm thu

- **AC32** Desktop nhiều cửa sổ: dock có Ghi chú; mở Ghi chú → Công việc thu nhỏ (giữ trạng thái), chỉ một cửa sổ hiện; phím `N` thuộc cửa sổ ở trước; dock chuyển lại không tải lại; đóng Ghi chú → Công việc vẫn thu nhỏ; `#/note/<id>` mở Ghi chú trước.
- **AC33** Danh sách: cây thư mục của tôi (sắp tên), ghi chú của tôi, được chia sẻ nhóm theo người (cá nhân, editor, qua phòng); không hiện ghi chú riêng tư / công khai của người khác; ghim; số đếm 3 bộ lọc; bộ lọc nhanh ẩn/hiện đúng phần và nhớ; tìm không dấu theo tiêu đề/nội dung/thẻ.
- **AC34** Xem: Markdown/rich/thuần hiển thị an toàn; đường dẫn thư mục; nút theo quyền (xem / sửa / owner); mục lục bật/tắt; link `#/note/<id>` (cả ghi chú công khai không có trong danh sách; id lạ → toast).
- **AC35** Soạn: tạo (tiêu đề bắt buộc; owner tôi, private, content đúng `text_type`), sửa (tiêu đề, nội dung 3 định dạng, đổi định dạng chuyển nội dung, thẻ mới), editor của ghi chú được chia sẻ sửa được nhưng không chuyển thư mục; record đọc lại khớp.
- **AC36** Chia sẻ, ghim, xoá: lưu `visibility` + 4 danh sách đúng (rỗng `null`); ghim/bỏ ghim tạo/xoá `notes_pin` của tôi; xoá ghi chú có xác nhận, ghim của nó mất theo.
- **AC37** Thư mục: tạo tại chỗ (nút `new-folder` ở đầu mục Thư mục luôn tạo ở **gốc**, kể cả khi đang mở ghi chú trong thư mục con — 2026-10-04; thư mục con từ menu ⋯), đổi tên (F2 / bấm đúp / menu), Esc huỷ; xoá chỉ khi trống (có xác nhận), không trống → toast.

- **AC38** URL: mở Ghi chú → `?app=notes` (Công việc `?app=tasks`), refresh vẫn Ghi chú (không về Công việc); mở ghi chú / task → hash của mục, refresh mở lại đúng mục; tìm kiếm → `q`, refresh giữ từ khoá; chuyển app → URL theo app mới, không sót link app kia; link `#/task/…` khi Ghi chú ở trước → Công việc lên trước; đóng cửa sổ ở trước → URL sạch.
- **AC39** Cỡ chữ: mọi chữ hiển thị của hai app 13.5px (kể cả ô nhập, nút, nhãn, nội dung, popup, menu), `h1` / `h2` 20px; chỉ chữ cái avatar khác.
- **AC40** Thẻ việc: không có nút xoá; rê chuột lên Người giao / Giao cho / Ưu tiên hiện hover card ngay (không chờ); cột Giao cho = avatar `assignee` (tên ở tên truy cập); Ưu tiên chỉ cờ (tên truy cập "Ưu tiên: <nhãn>"); Hạn chót tối đa 2 dòng trong cột 84px ("Quá hạn hôm nay" xuống 2 dòng); ≤980px: nhãn vai trò + tên, nhãn ưu tiên, hạn một dòng.

## 10. App "Cài đặt" và thiết lập cá nhân (thêm 2026-10-04)

### 10.1 Object `user_settings` (tạo qua API 2026-10-04)

| Object | ID | Field |
|---|---|---|
| `user_settings` ("User Setting" / "Thiết lập cá nhân") | `OTDEMOSETTING` | `name` auto-number `UST-00000` (`OFDEMOX002000`), `desktop_wallpaper` (`OFDEMOX003000`, "Ảnh nền Desktop") |

- **Một bản ghi mỗi người, của ai = `created_by`** (không có field owner). Đọc: `created_by = $currentUser`, sắp `updated` giảm dần, lấy bản đầu (bản thừa bỏ qua). Chưa có bản ghi = ảnh mặc định.
- `desktop_wallpaper`: file **một giá trị** (`multiple` 0, `multiple_limit` 0–1), `file_type` jpg/jpeg/png/webp, `max_size` 20 MB, `file_group_type` image, `is_public: false`, `is_resizable: true` (server có thêm `_hidden_desktop_wallpaper`).
- Ghi (đã kiểm trên Workspace gốc): upload `/api/v1/file/upload/v2/client_upload` với `field_slug=desktop_wallpaper`, `object_slug=user_settings` → FILE_METADATA; ghi field bằng **một object** metadata (gửi mảng `[meta]` bị từ chối `r: 626 … not found file id`); về mặc định gửi `null`. Đọc về: chuỗi JSON của một object.
- Ảnh hiển thị: `/files/<file_id>/original/<fileName>?redirect=true` cùng origin (cookie phiên; trả thẳng ảnh `image/png`…). `/files/0/…` trả `FILE NOT PUBLIC`.
- **Security rule (2026-10-04):** 4 rule `[Settings] - …` — Tạo (type 1, `OSDEMOX004000`) mọi nhân sự, mọi trường; Xem / Sửa / Xoá (type 2: `OSDEMOX005000`, `OSDEMOX006000`, `OSDEMOX007000`) chỉ bản ghi do mình tạo (`created_by` `OFDEMOX008000`). Role "Standard User" `RODEMOX009000` cấp CRUD cho object này.

### 10.2 Ảnh nền Desktop

- Ảnh nền nằm ở lớp `body::before` = `var(--bg-overlay), var(--wallpaper, url("./assets/bg-default.webp"))`; ảnh riêng đặt bằng `--wallpaper: url("…")` trên `:root`.
- Desktop khi mở: hiện ngay URL ảnh lần trước của trình duyệt này (`localStorage` `cong-viec.wallpaper`, '' = mặc định), rồi đọc `user_settings` và đổi nếu khác; đọc lỗi thì giữ nguyên. Ảnh mới chỉ thay sau khi tải xong (ảnh cũ ở lại tới lúc đó), lệnh sau cùng thắng.

### 10.3 Cửa sổ "Cài đặt"

- Dock: `dock-app-cai-dat` (icon bánh răng, nền xám), id cửa sổ `cai-dat`, URL `?app=settings`; chunk riêng (lazy). Cột trái: nút cửa sổ, `h1.brand` "Cài đặt", mục "Hình nền" (`settings-nav-wallpaper`, đang chọn). Nội dung: tiêu đề `h2` "Hình nền Desktop", khung xem trước 16:9 (`wallpaper-preview`, ảnh đang hiện, tên file hoặc "Ảnh mặc định" ở `wallpaper-name`, kéo thả ảnh vào được), nút **Chọn ảnh…** (`wallpaper-choose` + `wallpaper-input` accept jpg/jpeg/png/webp), **Dùng ảnh mặc định** (`wallpaper-reset`, khoá khi đang là mặc định), gợi ý "JPG, PNG hoặc WebP, tối đa 20 MB".
- Chọn ảnh: kiểm đuôi / rỗng / 20 MB ở client (lỗi → `wallpaper-error`, không gửi) → upload → tạo bản ghi (chưa có) hoặc sửa bản ghi của tôi → hiện ảnh sau khi tải xong → toast "Đã đổi ảnh nền". Server từ chối loại file → "Không đổi được ảnh nền: Chỉ nhận ảnh JPG, PNG hoặc WebP.". Đặt lại → field `null`, toast "Đã dùng lại ảnh nền mặc định".
- Đọc thiết lập lỗi → `settings-load-error` + "Thử lại", nút khoá; hết phiên → hộp `session-expired`.

### 10.4 Tiêu chí nghiệm thu

- **AC42** Sửa / xoá ghi chú của tôi: chỉ note của tôi có nút; sửa → 10201 activity chỉ `id` + `content`, không đổi thì không gửi, nội dung mới hiện + đọc lại khớp (Workspace); xoá qua hộp xác nhận → 218 activity `ids: [id]`, mục mất, số đếm giảm, API không còn (Workspace).
- **AC43** Review 2026-10-08: nút Làm mới đọc lại danh sách, danh sách vẫn hiện; form tạo Người giao · Người được giao · Người theo dõi một hàng rộng bằng nhau (AC25, AC10); avatar Người giao / Giao cho trên thẻ 30×30; URL + dấu cách / Enter → link khi lưu, ftp:// giữ chữ.
- **AC46** Dev tools: mở từ dock → `?app=devtools`, giữ sau tải lại; JSON định dạng có màu, đổi kiểu thụt lề, lỗi báo dòng / cột; Markdown xem trước (bảng, code) không chạy script; JWT giải mã header / payload, kiểm chữ ký bằng secret, tạo token trùng token mẫu; Base64 mã hoá ⇄ giải mã UTF-8, đổi chiều; đổi công cụ giữ nội dung đã gõ; không gọi API.
- **AC45** Lọc theo người: tick "giao" trên chip một người → chỉ còn việc người đó giao, chip có `data-on`, các chip giữ nguyên; tick thêm "được giao", "theo dõi" → hợp của cả ba; "Bỏ lọc người này" → danh sách như cũ; không gọi API.
- **AC44** Cột danh sách: mặc định Mã · Công việc · Trạng thái · Người giao · Giao cho · Ưu tiên · Hạn chót, mã thẳng cột; ẩn / đổi thứ tự qua menu → tiêu đề + thẻ đổi ngay, giữ sau tải lại, Mặc định khôi phục; kéo đường giữa tiêu đề đổi độ rộng (cả đường sau Công việc), thẻ thẳng cột, giữ sau tải lại, double-click về mặc định.
- **AC41** Cài đặt / ảnh nền: dock có Cài đặt, `?app=settings` mở lại sau refresh; chưa có bản ghi → ảnh mặc định, nút đặt lại khoá; chọn ảnh hợp lệ → upload đúng `desktop_wallpaper`/`user_settings`, đúng một bản ghi của tôi (`created_by` = tôi) chứa một FILE_METADATA, ảnh nền đổi (cả sau khi tải lại trang và trên máy khác); ảnh thứ hai sửa cùng bản ghi; đặt lại → `null`, ảnh mặc định; file sai loại / quá 20 MB bị chặn trước khi gửi.

## 11. Workspace thứ hai: globex.cogover.example (thêm 2026-10-05)

Cùng một bản build chạy được ở nhiều Workspace: ID object / field / layout chọn theo `location.hostname` trong `app/src/workspaces.ts`, mọi chỗ khác đọc qua `WS` (test `conventions.test.ts` chặn ID ghi cứng ngoài file này). Localhost và hostname lạ dùng bộ đầu tiên (cũng là bộ của mock và test). Thêm Workspace mới: tạo các object theo `objects/README.md` rồi thêm một bộ ID vào file này.

## 12. App "Dev tools" (thêm 2026-10-12)

Cửa sổ thứ tư của SPA: `src/devtools/`, dock `dock-app-dev-tools` (tên "Dev tools", nằm giữa Ghi chú và Cài đặt), URL `?app=devtools`, chunk riêng (`lazyWindow`, tải trước khi rảnh), khung `devtools-app`. **Không có backend, không gọi API Cogover, không gửi dữ liệu đi đâu**; nội dung đã gõ **không lưu** (có thể là token / secret) — chỉ nhớ công cụ đang mở ở localStorage `cong-viec.devtools`. Cột trái: `devtools-nav-json | markdown | jwt | base64`; tiêu đề `devtools-title`. Cột trái ẩn / hiện (`side-toggle`, ⌘/Ctrl+\\) và kéo đổi độ rộng như các app khác (mặc định 220px, lưu `cong-viec.devtools.side`); khi ẩn, bốn công cụ thành tab `devtools-tab-<id>` bên phải thanh tiêu đề. Cả bốn công cụ luôn được mount (`devtools-tool-<id>`, ẩn bằng `hidden`) nên đổi công cụ giữ nội dung. Mỗi công cụ hai nửa cạnh nhau (≤ 880px: xếp dọc), nửa phải có nút Sao chép (toast "Đã sao chép").

- **JSON** ("Format & beautify JSON"): `json-input` (JSON gốc) → `json-output` (`<pre>` đã định dạng, mỗi token một span `j-key` / `j-str` / `j-num` / `j-bool` / `j-null` / `j-punc`, màu theo theme). `json-indent` (Select): thụt 4 dấu cách (mặc định) / 2 dấu cách, Tab, thu gọn một dòng. JSON hỏng → `json-error` "JSON không hợp lệ (dòng L, cột C)" + lý do tiếng Việt (bộ dò riêng `findJsonError`, vì trình duyệt thường không báo vị trí). `json-sample` "Ví dụ", `json-clear` "Xoá", `json-copy`.
- **Markdown** ("Markdown editor"): `markdown-input` → `markdown-output` (GFM: bảng, code, danh sách; qua `sanitizeDescription`, kiểu chữ `.prose` của Ghi chú). `markdown-sample`, `markdown-clear`, `markdown-copy` "Sao chép HTML".
- **JWT** ("JWT decoder / encoder"): `jwt-mode` Giải mã / Tạo token.
  - Giải mã: `jwt-input` (bỏ qua tiền tố "Bearer ") → `jwt-header`, `jwt-payload` (JSON có màu), `jwt-times` (iat / nbf / exp theo giờ Việt Nam), `jwt-state` (Còn hiệu lực / Đã hết hạn / Chưa có hiệu lực, khi có exp hoặc nbf), `jwt-check[data-check]` = `none | valid | invalid | unsupported` theo `jwt-secret` (chỉ HS256 / HS384 / HS512, Web Crypto). Token hỏng → `jwt-error` nêu phần nào sai. `jwt-sample` tạo token mẫu ký bằng secret mẫu.
  - Tạo token: `jwt-payload-input` (JSON), `jwt-sign-secret`, `jwt-alg` (Select) → `jwt-token` (ba phần ba màu), `jwt-copy-token`; payload không phải JSON → `jwt-encode-error`; chưa có secret → chưa ký.
- **Base64** ("Base64 decoder / encoder"): `base64-mode` Mã hoá / Giải mã, `base64-input` → `base64-output`; văn bản là UTF-8 (tiếng Việt, emoji); `base64-urlsafe` (khi mã hoá: `-`, `_`, bỏ `=`); giải mã nhận cả hai bảng chữ, có hoặc không có `=`, bỏ qua khoảng trắng; sai → `base64-error`. `base64-swap` "Đổi chiều" đưa kết quả sang ô nhập và đổi chế độ.
