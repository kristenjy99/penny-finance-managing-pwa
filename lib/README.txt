Thư viện đọc ảnh / PDF ngoại tuyến của Penny (v0.6.0). Chỉ được nạp khi mở tab "Ảnh / Sao kê" và chọn file.
Service worker cất các file này vào cache riêng "penny-lib" ở lần dùng đầu, giữ qua các lần cập nhật app.
Nếu sau này đổi phiên bản thư viện: đặt vào thư mục / tên file mới để máy người dùng tải lại.

Nguồn (tải từ npm ngày 22/11/2026, không sửa nội dung, chỉ bỏ dòng sourceMappingURL):
- tesseract/tesseract.esm.min.js, tesseract/worker.min.js
    gói tesseract.js 7.0.0 (dist/) – giấy phép Apache-2.0 (tesseract/LICENSE.txt)
- tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js, tesseract-core-simd-lstm.wasm.js, tesseract-core-lstm.wasm.js
    gói tesseract.js-core 7.0.0 – Apache-2.0 (tesseract/core/LICENSE.txt). Trình duyệt tự chọn bản hợp với máy
    (relaxedsimd > simd > thường). Chỉ cần bản "-lstm" vì Penny chỉ dùng mô hình LSTM.
- tesseract/lang/vie.traineddata.gz, eng.traineddata.gz
    gói @tesseract.js-data/vie 1.0.0 và @tesseract.js-data/eng 1.0.0, thư mục 4.0.0_best_int – MIT
    (dữ liệu gốc tesseract-ocr/tessdata_best, Apache-2.0)
- pdfjs/pdf.min.mjs, pdfjs/pdf.worker.min.mjs
    gói pdfjs-dist 6.5.438, bản legacy/build (chạy được trên trình duyệt cũ hơn) – Apache-2.0 (pdfjs/LICENSE.txt)
    Không kèm cmaps/ và standard_fonts/: Penny chỉ lấy lớp chữ của PDF (không cần) và trang scan là ảnh (không cần font).
- fflate.js (gói fflate 0.8.3, esm/browser.js) – MIT (fflate-LICENSE.txt)
    Chỉ dùng khi trình duyệt không có DecompressionStream('deflate-raw') (Safari trước 16.4) để giải nén file .xlsx.

Tổng 15 file, khoảng 18 MB, file lớn nhất 3,9 MB (vừa giới hạn upload web GitHub: 25 MB/file, 100 file/lần).
Dung lượng tải lần đầu: đọc PDF có chữ ≈ 1,9 MB; đọc ảnh / PDF scan ≈ 8,4 MB (bộ OCR 3,9 MB + vie 1,4 MB + eng 2,9 MB).
