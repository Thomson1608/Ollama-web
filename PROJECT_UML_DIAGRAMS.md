# Project UML Diagrams

## 1. Requirement Design

### 1.2 Structure System

```plantuml
@startuml
node "Client Browser" {
  [React Frontend (Vite)] as Frontend
}

node "Node.js Server" {
  [Express API] as API
  [Socket.IO Server] as WSServer
  [System Monitor] as SysMon
  [Workspace Manager] as Workspace
}

database "Firebase Firestore" {
  [NoSQL Database] as DB
}

node "Local Environment" {
  [Ollama Service] as Ollama
  [Local File System] as FS
}

Frontend <--> API : REST (HTTP)
Frontend <--> WSServer : WebSocket
API --> DB : Read/Write
API --> Ollama : HTTP Proxy / API
API --> FS : Read/Write Files
SysMon --> FS : Read Stats
Workspace --> FS : Git / File Ops
@enduml
```

---

## 2. Basic Design

### 2.1 Screen Transition Table

```plantuml
@startuml
[*] --> LoginView
LoginView --> ProjectListView : Login Success
ProjectListView --> ProjectInitView : Click "New Project"
ProjectListView --> ChatView : Select Project
ProjectInitView --> ChatView : Create Project

state MainApp {
  ChatView
  ModelsView
  PullView
  WorkspaceView
  SettingsView
  SystemControlView
}

ChatView --> ModelsView : Sidebar Click
ChatView --> PullView : Sidebar Click
ChatView --> WorkspaceView : Sidebar Click
ChatView --> SettingsView : Sidebar Click
ChatView --> SystemControlView : Sidebar Click

MainApp --> LoginView : Logout
@enduml
```

### 2.2 Data Item from Backend to Frontend (Base on Screen)

```plantuml
@startuml
actor User
participant "Frontend (React)" as FE
participant "Backend (Express)" as BE
database "Firestore" as DB

User -> FE : Navigate to ChatView
FE -> BE : GET /api/chats?projectId=...
BE -> DB : Query chats
DB --> BE : Return chat documents
BE --> FE : JSON: chats[]
FE -> FE : Update state & Render

User -> FE : Send Message
FE -> BE : POST /api/ollama/chat
BE -> DB : Save User Message
BE -> BE : Call LLM API
loop Streaming Response
  BE --> FE : Socket.IO: chat:chunk
  FE -> FE : Update UI (typing effect)
end
BE -> DB : Save Assistant Message
BE --> FE : Socket.IO: chats:updated
@enduml
```

### 2.3 Data Schema (Firebase Firestore)

```plantuml
@startuml
entity "User" as user {
  * id : string
  --
  username : string
  role : string
}

entity "Project" as project {
  * id : string
  --
  userId : string
  name : string
  description : string
  createdAt : number
}

entity "Chat" as chat {
  * id : string
  --
  projectId : string
  title : string
  model : string
  createdAt : number
  systemPrompt : string
}

entity "Message" as msg {
  * id : string
  --
  chatId : string
  role : string
  content : string
  timestamp : number
}

entity "Config" as config {
  * userId : string
  --
  systemPrompt : string
  parameters : object
}

user ||--o{ project : "has"
user ||--|| config : "has"
project ||--o{ chat : "contains"
chat ||--o{ msg : "contains"
@enduml
```

### 2.4 Module Backend

```plantuml
@startuml
package "Backend Modules" {
  [User & Auth Module] as Auth
  [Project Module] as Proj
  [Chat Module] as Chat
  [Ollama/AI Module] as AI
  [Workspace Module] as WS
  [System Module] as Sys
}

Auth --> [Firebase Admin]
Proj --> [Firebase Admin]
Proj --> WS : Init Workspace
Chat --> [Firebase Admin]
Chat --> AI : Process Message
WS --> [Local File System] : Read/Write
WS --> [Simple Git] : Version Control
Sys --> [Systeminformation] : Get Stats
@enduml
```

---

## 3. Detail Design

### 3.2 State Transition Table (Frontend State)

```plantuml
@startuml
state "App Initialization" as Init
state "Logged Out" as LoggedOut
state "Logged In (No Project)" as NoProject
state "Active Project" as ActiveProject

[*] --> Init
Init --> LoggedOut : username == null
Init --> ActiveProject : username && projectId
Init --> NoProject : username && !projectId

LoggedOut --> NoProject : Login Success
NoProject --> ActiveProject : Select/Create Project
ActiveProject --> LoggedOut : Logout

state ActiveProject {
  state "Chat View" as Chat
  state "Workspace View" as Workspace
  state "Models View" as Models
  
  [*] --> Chat
  Chat --> Workspace : Change View
  Workspace --> Models : Change View
}
@enduml
```

### 3.3 Function Detail Design

```plantuml
@startuml
participant "UI Component" as UI
participant "App State" as State
participant "Backend API" as API
participant "Ollama Service" as Ollama
participant "Workspace" as WS

UI -> State : handleSendMessage(content)
State -> UI : Add User Message (Optimistic)
State -> API : POST /api/ollama/chat
API -> Ollama : Send Prompt
Ollama --> API : Stream Chunk (Text)
API --> State : Socket.IO 'chat:chunk'
State -> UI : Append Text

Ollama --> API : Stream Chunk (contains <tool_call>)
API -> API : Parse Tool Call
API -> WS : Execute Tool (e.g., write_file)
WS --> API : Tool Result
API --> State : Socket.IO 'tool:result'
State -> UI : Show Toast Notification

Ollama --> API : Done
API --> State : Socket.IO 'chats:updated'
State -> UI : Finalize Message
@enduml
```

### 3.4 Agent Tool Calling Workflow (New)

```plantuml
@startuml
start
:AI generates response chunk;
if (Chunk contains <tool_call>?) then (yes)
  :Extract tool name and arguments;
  if (User is Admin?) then (yes)
    :Execute tool in Workspace;
    :Send result back to UI via Socket.IO;
    :Log tool execution;
  else (no)
    :Send "Access Denied" error to UI;
  fi
else (no)
  :Stream text to UI;
fi
stop
@enduml
```

### 3.5 Model Controller Design (Detail Back End)

```plantuml
@startuml
class "ChatController" as CC {
  + getChats(req, res)
  + createChat(req, res)
  + handleChatMessage(req, res)
}

class "WorkspaceController" as WC {
  + getFiles(req, res)
  + writeFile(req, res)
  + executeCommand(req, res)
}

class "SystemController" as SC {
  + getStats(req, res)
  + getProcesses(req, res)
}

class "OllamaService" as OS {
  + generateStream(prompt, model)
  + getModels()
}

class "FirestoreService" as FS {
  + saveDocument(collection, data)
  + queryDocuments(collection, filters)
}

CC --> OS : Uses
CC --> FS : Uses
WC --> FS : Uses
@enduml
```
