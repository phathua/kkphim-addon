# Hướng dẫn Deploy KKPhim Stremio Addon lên Cloudflare Workers

Dự án này sử dụng **Cloudflare Workers** để chạy addon. Vì Cloudflare yêu cầu xác thực tài khoản, bạn cần thực hiện một số bước thủ công dưới đây.

## Bước 1: Cài đặt Dependencies
Mở terminal tại thư mục `kkphim-addon` và chạy:
```bash
npm install
```

## Bước 2: Đăng nhập vào Cloudflare
Chạy lệnh sau để đăng nhập (Trình duyệt sẽ tự động mở để bạn xác nhận):
```bash
npx wrangler login
```

## Bước 3: Deploy
Sau khi đăng nhập thành công, bạn có thể deploy addon bằng lệnh:
```bash
npm run deploy
```

## Bước 4: Cài đặt Addon vào Stremio
1. Sau khi deploy thành công, terminal sẽ hiển thị một URL có dạng: `https://kkphim-stremio-addon.<your-username>.workers.dev`.
2. Copy URL này.
3. Thêm `/manifest.json` vào cuối URL (Ví dụ: `https://kkphim-stremio-addon.username.workers.dev/manifest.json`).
4. Mở ứng dụng Stremio, vào phần **Addons**, dán link vào ô tìm kiếm và nhấn **Install**.

---

### Lưu ý khi phát triển
- Chạy `npm run dev` để test local.
- Link local manifest sẽ là: `http://localhost:8787/manifest.json`.
- Bạn có thể dán link local này vào Stremio Desktop để test nhanh.
