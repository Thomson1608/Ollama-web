# Project Documentation: Local Developer Agent & Chat Interface

## 1. Requirement Design

### 1.1 Overview System
Hệ thống là một ứng dụng web đóng vai trò như một trợ lý AI (Developer Agent) và giao diện chat cục bộ. Ứng dụng cho phép người dùng quản lý các dự án (projects), giao tiếp với các mô hình ngôn ngữ lớn (LLMs) thông qua Ollama hoặc Claude, quản lý không gian làm việc (workspace) với trình quản lý file và terminal, cũng như theo dõi tài nguyên hệ thống (CPU, RAM, Disk, Processes). Hệ thống sử dụng Firebase Firestore để lưu trữ dữ liệu và Socket.IO để cập nhật trạng thái theo thời gian thực (real-time).

### 1.2 Structure System
Hệ thống được thiết kế theo kiến trúc Client-Server:
- **Frontend (Client):** Xây dựng bằng React (Vite), sử dụng Tailwind CSS cho giao diện, Lucide React cho icon, và Socket.IO Client để nhận dữ liệu real-time.
- **Backend (Server):** Xây dựng bằng Node.js và Express. Cung cấp các RESTful APIs, quản lý WebSocket (Socket.IO) để stream dữ liệu chat và tiến trình, giao tiếp với Firebase Firestore, thực thi các lệnh shell (Terminal), và tương tác với Ollama API.
- **Database:** Firebase Firestore (NoSQL) lưu trữ thông tin người dùng, dự án, lịch sử chat, tin nhắn và cấu hình.
- **Local File System:** Lưu trữ mã nguồn của các dự án (workspace) và quản lý phiên bản bằng Git.

---

## 2. Basic Design

### 2.1 Screen Transition Table

| Màn hình hiện tại | Hành động / Điều kiện | Màn hình tiếp theo |
| :--- | :--- | :--- |
| **Login View** | Nhập username hợp lệ -> Click Login | **Project List View** |
| **Project List View** | Click "New Project" | **Project Init View** |
| **Project List View** | Chọn một dự án hiện có | **Chat View** (Mặc định) |
| **Project Init View** | Điền thông tin -> Click "Create" | **Chat View** |
| **Bất kỳ View nào (có Sidebar)** | Click icon "Chat" trên Sidebar | **Chat View** |
| **Bất kỳ View nào (có Sidebar)** | Click icon "Models" trên Sidebar | **Models View** |
| **Bất kỳ View nào (có Sidebar)** | Click icon "Pull" trên Sidebar | **Pull View** |
| **Bất kỳ View nào (có Sidebar)** | Click icon "Workspace" trên Sidebar | **Workspace View** |
| **Bất kỳ View nào (có Sidebar)** | Click icon "Settings" trên Sidebar | **Settings View** |
| **Bất kỳ View nào (có Sidebar)** | Click icon "System" trên Sidebar | **System Control View** |
| **Bất kỳ View nào (có Sidebar)** | Click "Logout" | **Login View** |

### 2.2 Data Item from Backend to Frontend (Base on Screen)

- **Login View:** `username` (input).
- **Project List View:** `projects` (Array of Project: `id`, `name`, `details`, `createdAt`).
- **Chat View:**
  - `chats` (Array of Chat: `id`, `title`, `model`, `messages`).
  - `messages` (Array of Message: `role`, `content`, `timestamp`, `images`).
  - `activeChatId` (string).
  - `models` (Array of OllamaModel).
  - `runningModels` (Array of RunningModel).
- **Models View:** `models` (danh sách model đã cài), `runningModels` (model đang chạy).
- **Pull View:** `pullingModel` (trạng thái tải model: `progress`, `status`).
- **Workspace View:** `files` (Array of WorkspaceFile: `name`, `isDirectory`, `size`, `mtime`), `terminalOutput` (lịch sử lệnh).
- **Settings View:** `systemPrompt` (string), `globalParameters` (temperature, topP, topK, maxTokens).
- **System Control View:** `stats` (CPU, RAM, Disk), `processes` (PID, Name, Status, CPU%, MEM%, User), `services`.

### 2.3 Data Schema (Firebase Firestore)

Dựa trên `firebase-blueprint.json`:
- **User:** `/users/{userId}` -> `{ id, username, role }`
- **Config:** `/users/{userId}/configs/default` -> `{ userId, systemPrompt, parameters }`
- **Project:** `/projects/{projectId}` -> `{ id, userId, name, description, createdAt }`
- **Chat:** `/projects/{projectId}/chats/{chatId}` -> `{ id, projectId, title, model, createdAt, systemPrompt }`
- **Message:** `/projects/{projectId}/chats/{chatId}/messages/{messageId}` -> `{ id, chatId, role, content, timestamp }`
- **Memory:** `/projects/{projectId}/memories/{memoryId}` -> `{ id, userId, content, timestamp }`
- **Stat:** `/stats/{statKey}` -> `{ key, value }`

### 2.4 Module Backend

- **User & Auth Module:** Quản lý đăng nhập (dựa trên username), phân quyền (admin/user).
- **Project Module:** CRUD dự án, khởi tạo thư mục workspace và git repo tương ứng.
- **Chat Module:** Quản lý phiên chat, lưu trữ tin nhắn.
- **Ollama/AI Module:** Giao tiếp với Ollama API (chat, pull, tags, ps) và Claude API. Xử lý streaming response.
- **Workspace Module:** Đọc/ghi file, quản lý thư mục, thực thi lệnh shell (Terminal), quản lý Git commit.
- **System Module:** Thu thập thông số hệ thống (CPU, RAM, Disk, Processes) sử dụng thư viện `systeminformation`.
- **Config & Memory Module:** Quản lý cấu hình AI (System Prompt, Parameters) và bộ nhớ dài hạn.

---

## 3. Detail Design

### 3.1 Screen Detail Design

- **LoginView:** Màn hình đơn giản với logo, ô nhập username và nút "Enter Workspace".
- **ProjectListView:** Hiển thị danh sách dự án dưới dạng thẻ (card). Có nút tạo mới và xóa dự án.
- **ChatView:**
  - **Header:** Chọn model, hiển thị trạng thái kết nối, model đang chạy.
  - **Sidebar:** Danh sách lịch sử chat, các nút điều hướng (Models, Workspace, Settings...).
  - **Main Area:** Hiển thị tin nhắn (hỗ trợ Markdown), ô nhập liệu (hỗ trợ đa dòng, gửi ảnh).
- **ModelsView:** Lưới (grid) hiển thị các model đã cài đặt. Có tab lọc (Local/Cloud), thanh tìm kiếm, badge phân loại (Chat Support / Image Model), và nút xóa model.
- **PullView:** Ô nhập tên model từ thư viện Ollama, thanh tiến trình (progress bar) hiển thị % tải xuống.
- **WorkspaceView:**
  - **Trái:** Cây thư mục (File Explorer).
  - **Phải (Trên):** Trình soạn thảo mã nguồn (Code Editor) hoặc Diff Viewer.
  - **Phải (Dưới):** Terminal tích hợp để chạy lệnh.
- **SystemControl:** Các tab Monitor (Biểu đồ CPU/RAM/Disk), Processes (Bảng tiến trình có thể sort theo cột), Services, Terminal hệ thống.

### 3.2 State Transition Table (Frontend State)

| State | Initial Value | Trigger / Action | Next Value |
| :--- | :--- | :--- | :--- |
| `username` | `localStorage` hoặc `null` | Login thành công | `string` (username) |
| `projectId` | `localStorage` hoặc `null` | Chọn project / Tạo project | `string` (projectId) |
| `currentView` | `chat` | Click menu Sidebar | `models`, `workspace`, `settings`, v.v. |
| `chats` | `[]` | `fetchChats()` hoặc Socket `chats:updated` | `Chat[]` |
| `activeChatId` | `localStorage` hoặc `null` | Chọn chat / Tạo chat mới | `string` (chatId) |
| `connectionStatus` | `checking` | `checkConnection()` thành công/thất bại | `connected` / `disconnected` |
| `isLoading` | `false` | Gửi tin nhắn -> Nhận xong | `true` -> `false` |

### 3.3 Function Detail Design

- **`checkConnection()` (Frontend):** Gọi API `/api/ollama/tags`. Nếu thành công, set `connectionStatus` là `connected` và cập nhật danh sách `models`. Nếu lỗi, set `disconnected` và hiện Toast.
- **`handleSendMessage(content, images)` (Frontend):**
  - Thêm tin nhắn của User vào UI ngay lập tức.
  - Gọi POST `/api/ollama/chat` với `chatId`, `model`, `messages`.
  - Lắng nghe sự kiện Socket.IO `chat:chunk` để cập nhật tin nhắn của Assistant theo kiểu streaming (từng chữ một).
- **`fetchChats(projectId)` (Frontend):** Gọi GET `/api/chats?projectId=...`. Cập nhật state `chats`. Đảm bảo dữ liệu trả về luôn là mảng để tránh lỗi `chats.find is not a function`.
- **`handleSort(column)` (SystemControl):** Thay đổi `sortColumn` và `sortDirection` (asc/desc). Hàm `sort` trong render sẽ sắp xếp mảng `processes.list` dựa trên state này.
- **`Terminal Execution` (Backend):** POST `/api/workspace/exec`. Sử dụng `child_process.exec` để chạy lệnh trong thư mục dự án. Trả về `stdout` và `stderr`.

### 3.4 Library Detail Design

**Frontend Dependencies:**
- `react`, `react-dom`: Thư viện lõi xây dựng UI.
- `socket.io-client`: Kết nối WebSocket để nhận streaming text và real-time updates.
- `sonner`: Hiển thị thông báo (Toast) đẹp mắt.
- `lucide-react`: Bộ icon SVG nhẹ và nhất quán.
- `motion` (Framer Motion): Tạo hiệu ứng animation (ví dụ: mở rộng/thu gọn Sidebar).
- `recharts`: Vẽ biểu đồ (Line chart, Bar chart) cho System Monitor.
- `react-markdown`: Render nội dung tin nhắn AI từ Markdown sang HTML.
- `tailwindcss`: Utility-first CSS framework để style giao diện nhanh chóng.

**Backend Dependencies:**
- `express`: Web framework xử lý REST API.
- `socket.io`: WebSocket server.
- `firebase`, `firebase-admin`: SDK kết nối và tương tác với Firestore Database.
- `simple-git`: Thực thi các lệnh git (init, add, commit) bằng code Node.js.
- `systeminformation`: Lấy thông số phần cứng và OS (CPU, RAM, Disk, Processes).
- `http-proxy-middleware`: Proxy các request từ Frontend thẳng đến Ollama API nội bộ.
- `@google/genai`, `@anthropic-ai/sdk`: SDK gọi API của các LLM Cloud (Gemini, Claude).

### 3.5 Model Controller Design (Detail Back End)

- **`GET /api/projects`**:
  - Truy vấn Firestore collection `projects`.
  - Lọc theo `userId` (nếu cần).
  - Trả về mảng các dự án.
- **`POST /api/ollama/chat`**:
  - Nhận `chatId`, `projectId`, `model`, `messages`.
  - Lưu tin nhắn của User vào Firestore.
  - Khởi tạo kết nối tới Ollama (hoặc Claude API tùy model).
  - Sử dụng `responseType: 'stream'`. Khi nhận được từng chunk data từ LLM, dùng `io.emit('chat:chunk', ...)` để gửi về Frontend.
  - Khi hoàn thành, lưu tin nhắn của Assistant vào Firestore và emit `chats:updated`.
- **`GET /api/system/processes`**:
  - Gọi `si.processes()`.
  - Map dữ liệu trả về định dạng `{ pid, name, cpu, mem, user, state }`.
  - Trả về JSON cho Frontend hiển thị bảng.
- **`POST /api/workspace/write`**:
  - Nhận `projectId`, `filePath`, `content`.
  - Dùng `fs.promises.writeFile` để ghi file vào thư mục `data/users/{username}/workspaces/{projectId}/{filePath}`.
  - Dùng `simpleGit` để tự động `git add` và `git commit` thay đổi.
  - Emit sự kiện Socket.IO để báo hiệu file đã thay đổi.
