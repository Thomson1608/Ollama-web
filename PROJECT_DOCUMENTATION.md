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
- **Workspace View:** `files` (Array of WorkspaceFile: `name`, `isDirectory`, `size`, `mtime`), `terminalOutput` (lịch sử lệnh), `history` (Git log).
- **Settings View:** `systemPrompt` (string), `globalParameters` (temperature, topP, topK, maxTokens, jsonMode).
- **System Control View:** `stats` (CPU, RAM, Disk), `processes` (PID, Name, Status, CPU%, MEM%, User), `services`.

### 2.3 Data Schema (Firebase Firestore)

Cấu trúc phân cấp chi tiết:
- **Users Collection:** `/users/{userId}`
  - `{ id, username, role }`
  - **Configs Sub-collection:** `/users/{userId}/configs/default` -> `{ userId, systemPrompt, parameters }`
- **Projects Collection:** `/projects/{projectId}`
  - `{ id, userId, name, details, createdAt, lastPackageJsonHash }`
  - **Chats Sub-collection:** `/projects/{projectId}/chats/{chatId}`
    - `{ id, projectId, title, model, createdAt, systemPrompt, isClosed }`
    - **Messages Sub-collection:** `/projects/{projectId}/chats/{chatId}/messages/{messageId}`
      - `{ id, chatId, role, content, timestamp, images }`
  - **Memories Sub-collection:** `/projects/{projectId}/memories/{memoryId}`
    - `{ id, projectId, content, timestamp }`
- **Stats Collection:** `/stats/{statKey}` -> `{ key, value }` (e.g., `sent`, `success`, `fail`)

### 2.4 Module Backend

- **User & Auth Module:** Quản lý đăng nhập (username), phân quyền (admin/user). Chỉ admin mới có quyền chạy terminal hệ thống hoặc kill process.
- **Project Module:** CRUD dự án, khởi tạo thư mục workspace và git repo. Theo dõi hash của `package.json` để tự động `npm install`.
- **Chat Module:** Quản lý phiên chat, lưu trữ tin nhắn. Tích hợp logic **Memory Extraction** sau mỗi phiên chat để tóm tắt thông tin quan trọng.
- **AI Engine Module:**
  - Giao tiếp với Ollama API (chat, pull, tags, ps).
  - **Tool Execution:** Tự động phát hiện và thực thi các yêu cầu thao tác file (`write_file`, `read_file`, v.v.) từ AI thông qua thẻ `<tool_call>` hoặc heuristic code blocks.
- **Workspace Module:** 
  - File system operations (CRUD file/folder).
  - **Auto-commit:** Tự động commit vào Git sau mỗi lần thay đổi file.
  - **App Runner:** Khởi chạy ứng dụng trong workspace (Node.js/Vite) và proxy cổng ra ngoài.
- **System Module:** Thu thập thông số hệ thống, quản lý process và service sử dụng `systeminformation`.
- **Terminal Module:** Thực thi lệnh shell, hỗ trợ tab-completion bằng `bash compgen`.

---

## 3. Detail Design

### 3.1 Screen Detail Design

- **LoginView:** Màn hình đơn giản với logo, ô nhập username và nút "Enter Workspace".
- **ProjectListView:** Hiển thị danh sách dự án dưới dạng thẻ (card). Có nút tạo mới và xóa dự án.
- **ChatView:**
  - **Header:** Chọn model, hiển thị trạng thái kết nối, model đang chạy.
  - **Sidebar:** Danh sách lịch sử chat, các nút điều hướng.
  - **Main Area:** Hiển thị tin nhắn (Markdown), ô nhập liệu (đa dòng, gửi ảnh), hiển thị trạng thái "AI is thinking/executing".
- **ModelsView:** Lưới hiển thị các model. Có tab lọc (Local/Cloud), thanh tìm kiếm, badge phân loại, và nút xóa model.
- **PullView:** Ô nhập tên model từ thư viện Ollama, thanh tiến trình hiển thị % tải xuống.
- **WorkspaceView:**
  - **Trái:** Cây thư mục (File Explorer).
  - **Phải (Trên):** Code Editor / Diff Viewer / Preview App (Iframe).
  - **Phải (Dưới):** Terminal tích hợp.
- **SystemControl:** Monitor (CPU/RAM/Disk), Processes (Bảng có thể sort/kill), Services (Start/Stop), Terminal hệ thống.

### 3.2 Tool Calling & Agent Logic

Hệ thống biến AI thành một "Agent" thực thụ thông qua:
1. **System Prompt:** Cung cấp hướng dẫn về cách sử dụng công cụ.
2. **Tool Parsing:** Backend lắng nghe stream từ AI, nếu thấy thẻ `<tool_call>` sẽ tạm dừng stream, thực thi công cụ và gửi kết quả về cho AI (hoặc hiển thị lên UI).
3. **Danh sách công cụ:**
   - `list_files`: Liệt kê tệp tin.
   - `read_file`: Đọc nội dung tệp.
   - `write_file`: Ghi/Cập nhật tệp (kèm auto-commit).
   - `delete_file`: Xóa tệp.
   - `run_command`: Thực thi lệnh trong workspace.

### 3.3 Memory Extraction Logic

Sau khi kết thúc một phiên chat, backend sẽ:
1. Lấy 6 tin nhắn cuối cùng.
2. Gửi đến AI với prompt yêu cầu trích xuất các sự thật (facts), sở thích (preferences) hoặc mục tiêu dự án mới.
3. Hợp nhất với bộ nhớ hiện tại, loại bỏ trùng lặp.
4. Lưu lại vào Firestore để sử dụng làm ngữ cảnh cho các lần chat sau.

### 3.4 Function Detail Design

- **`autoCommit(username, message)`:** Sử dụng `simple-git` để `add .` và `commit`. Emit sự kiện `workspace:history_updated`.
- **`handleSendMessage`:** Gửi tin nhắn, lắng nghe Socket `chat:chunk`. Nếu AI gọi tool, kết quả tool sẽ được hiển thị qua `toast.info`.
- **`Terminal Completion`:** Gửi từ cuối cùng của lệnh lên backend, backend dùng `compgen` để trả về danh sách gợi ý.
- **`Fix Permissions`:** Chạy `chmod -R 777` trên thư mục workspace của user để giải quyết lỗi truy cập.

### 3.5 Library Detail Design

**Frontend:** `react`, `socket.io-client`, `sonner`, `lucide-react`, `motion`, `recharts`, `react-markdown`, `tailwindcss`.
**Backend:** `express`, `socket.io`, `firebase`, `simple-git`, `systeminformation`, `http-proxy-middleware`, `node-fetch`.

---

## 4. Model Controller Design (Detail Back End)

- **`POST /api/ollama/chat`**:
  - Làm giàu tin nhắn bằng System Prompt và Memory Context.
  - Stream dữ liệu từ Ollama.
  - Xử lý Tool Calling thời gian thực.
  - Lưu tin nhắn Assistant khi kết thúc.
  - Kích hoạt `extractMemory` và `autoCommit`.
- **`POST /api/workspace/run`**:
  - Kiểm tra `package.json`.
  - Chạy `npm install` nếu cần.
  - `spawn` tiến trình mới (`npm run dev` hoặc `npm start`).
  - Gán cổng (port) động và lưu vào `WORKSPACE_PORTS`.
  - Stream log của tiến trình qua Socket.IO.
- **`GET /api/system/stats`**: Trả về dữ liệu từ `si.currentLoad()`, `si.mem()`, `si.fsSize()`.
