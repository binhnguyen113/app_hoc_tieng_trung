# Cấu hình chat AI

App vẫn được host bằng GitHub Pages. Cloudflare Worker làm API trung gian để giữ khóa Gemini ở server, không đưa khóa vào `app.js`.

## 1. Tạo dịch vụ

1. Tạo API key Gemini trong [Google AI Studio](https://aistudio.google.com/apikey). Free tier có giới hạn; nội dung gửi trong free tier có thể được Google dùng để cải thiện sản phẩm.
2. Tạo tài khoản Cloudflare miễn phí và cài Node.js LTS.

## 2. Cấu hình Worker

Mở `worker/wrangler.toml` và thay:

- `ALLOWED_ORIGINS` bằng origin local và origin GitHub Pages của m, phân cách bằng dấu phẩy. Origin GitHub Pages chỉ gồm scheme và host, ví dụ `https://ten-tai-khoan.github.io`, không thêm tên repo hay dấu `/` cuối.

Trong PowerShell, chạy:

```powershell
cd worker
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put APP_ACCESS_TOKEN
npx wrangler deploy
```

Mỗi lệnh `secret put` sẽ hỏi giá trị ngay trong terminal. Đặt `APP_ACCESS_TOKEN` thành một chuỗi dài, riêng tư và dễ nhập trên iPhone. Không gửi các giá trị này vào chat, không commit chúng vào Git. Lưu URL Worker mà lệnh deploy in ra.

## 3. Nối giao diện

Trong `app.js`, thay giá trị `AI_API_BASE_URL` bằng URL Worker vừa nhận, rồi push thay đổi lên GitHub để Pages cập nhật. Mở app, vào **AI Chat**, nhập `APP_ACCESS_TOKEN` vào ô mã truy cập và bấm lưu trong tab.

## 4. Dùng thử

- **AI Chat:** chat chữ với gia sư HSK 1-2; app chỉ giữ hội thoại trong bộ nhớ trang hiện tại. Gemini free tier có hạn mức và điều khoản dữ liệu riêng.
- **Luyện nói:** ghi âm và nghe lại ngay trong tab; app không gửi audio lên dịch vụ.
- Chạy trên iPhone qua GitHub Pages HTTPS. Theo dõi quota chat trong Google AI Studio.

Worker giới hạn độ dài tin nhắn và đầu ra AI. Mã truy cập giúp giữ API cá nhân, nhưng không thay thế xác thực tài khoản nếu sau này mở app công khai cho nhiều người.