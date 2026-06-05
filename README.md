# 门店维修工单排队与质检复核系统

一个完整的门店设备维修工单管理 Web 应用，支持工单创建、优先级排队、技师接单、诊断报价、维修、质检复核和客户交付全流程管理。

## ✨ 功能特性

- **角色权限分离**：店员、技师、质检员三种角色，权限严格隔离
- **工单排队**：按优先级自动排序，支持多状态筛选
- **状态流转**：严谨的状态机控制，确保流程合规
- **版本控制**：乐观锁机制，防止并发修改冲突
- **操作历史**：完整的操作日志，记录每次处理责任人
- **质检复核**：质检员审核通过后才能交付
- **数据持久化**：SQLite 本地存储，重启数据不丢失
- **失败链路拦截**：防止跳质检、越权操作等违规行为

## 🛠 技术栈

### 后端
- **Node.js + Express** - Web 服务器
- **TypeScript** - 类型安全
- **better-sqlite3** - SQLite 数据库
- **jsonwebtoken** - JWT 认证
- **bcryptjs** - 密码加密

### 前端
- **React 18 + TypeScript** - UI 框架
- **Vite** - 构建工具
- **Zustand** - 状态管理
- **React Router** - 路由
- **Tailwind CSS** - 样式
- **Lucide React** - 图标
- **Day.js** - 日期处理

## 🚀 快速开始

### 环境要求
- Node.js >= 18
- npm >= 9

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

这会同时启动：
- 后端 API 服务器：`http://localhost:3002`
- 前端开发服务器：`http://localhost:5173`

Vite 已配置代理，`/api` 请求会自动转发到后端。

### 单独启动

```bash
# 仅启动前端
npm run client:dev

# 仅启动后端
npm run server:dev
```

### 构建生产版本

```bash
npm run build
```

## 👤 种子用户

系统启动时自动创建以下用户，默认密码均为 `123456`：

| 用户名 | 姓名 | 角色 | 权限 |
|--------|------|------|------|
| clerk1 | 店员小王 | 店员 | 建单、分派、确认报价、交付、取消 |
| tech1 | 技师老李 | 技师 | 接单、诊断、报价、维修、提交质检 |
| tech2 | 技师小张 | 技师 | 接单、诊断、报价、维修、提交质检 |
| inspector1 | 质检员老赵 | 质检员 | 质检复核 |

## 📋 角色权限说明

### 店员 (clerk)
- 创建工单
- 分派工单给技师
- 确认报价
- 交付工单给客户
- 取消工单
- 查看所有工单

### 技师 (technician)
- 接受分派给自己的工单
- 录入诊断结果和预估费用
- 录入维修详情和实际费用
- 提交质检
- 查看所有工单

### 质检员 (quality_inspector)
- 执行质检（通过/不通过）
- 查看所有工单

## 🔄 主链路流程

```
创建工单 → 分派工单 → 接单诊断 → 提交报价 → 确认报价
    ↓
交付客户 ← 质检通过 ← 质检复核 ← 提交质检 ← 开始维修
                          ↓
                      质检不通过 → 返修（重新维修）
```

### 步骤说明

1. **建单**：店员登记客户设备信息，选择优先级
2. **分派**：店员将工单分派给指定技师
3. **接单**：技师接单，状态变为「诊断中」
4. **诊断报价**：技师录入诊断结果和预估费用
5. **确认报价**：店员与客户确认后确认报价
6. **维修**：技师开始维修，录入维修详情
7. **提交质检**：维修完成后提交质检，状态变为「待质检」
8. **质检**：质检员审核，通过则状态变为「质检通过」，不通过则退回返修
9. **交付**：质检通过后，店员交付客户，状态变为「已交付」

## ❌ 失败链路验证

### 1. 跳过质检直接交付（状态校验）
- **场景**：在「维修中」或「待质检」状态直接尝试交付
- **预期结果**：操作被拒绝，提示「状态不允许交付：必须先完成质检复核，质检员审核通过后才能交付」

### 2. 质检员越权交付（权限校验）
- **场景**：质检员质检通过后直接尝试交付工单
- **预期结果**：操作被拒绝，提示「只有店员可以执行交付操作」

### 3. 版本冲突拦截（并发控制）
- **场景**：两人同时打开同一张工单，A 先提交修改，B 用旧版本提交
- **预期结果**：B 的提交被拒绝，提示「版本已变化，工单已被他人修改，请刷新后重试」

### 4. 非法状态流转
- **场景**：在「已交付」或「已取消」状态尝试修改工单
- **预期结果**：操作被拒绝，提示「状态不允许流转」

## 📁 项目结构

### 后端 (`api/`)

```
api/
├── types.ts              # 类型定义
├── db.ts                 # 数据库初始化
├── seed.ts               # 种子用户初始化
├── auth.ts               # 认证中间件、权限校验
├── workflow.ts           # 状态机、流转规则、版本控制
├── app.ts                # Express 应用配置
├── server.ts             # 服务器启动入口
├── index.ts              # Vercel 部署入口
├── routes/
│   ├── auth.ts           # 认证相关 API
│   └── tickets.ts        # 工单相关 API
└── store/
    ├── index.ts          # 存储模块聚合
    ├── userStore.ts      # 用户数据操作
    ├── ticketStore.ts    # 工单数据操作
    ├── operationLogStore.ts  # 操作日志
    └── qualityRecordStore.ts # 质检记录
```

### 前端 (`src/`)

```
src/
├── types.ts              # 类型定义
├── constants.ts          # 常量配置（状态、标签、颜色）
├── App.tsx               # 应用入口、路由配置
├── main.tsx              # React 入口
├── index.css             # 全局样式
├── lib/
│   ├── apiClient.ts      # API 客户端封装
│   └── utils.ts          # 工具函数
├── store/
│   └── authStore.ts      # Zustand 认证状态管理
├── components/
│   ├── Layout.tsx        # 布局组件
│   ├── ProtectedRoute.tsx    # 路由保护
│   ├── StatusBadge.tsx       # 状态/优先级标签
│   ├── StatusFilter.tsx      # 状态筛选器
│   ├── TicketCard.tsx        # 工单卡片
│   └── OperationHistory.tsx  # 操作历史时间线
└── pages/
    ├── Login.tsx             # 登录页
    ├── QueuePage.tsx         # 工单队列/列表页
    ├── TicketDetail.tsx      # 工单详情页
    └── CreateTicket.tsx      # 新建工单页
```

## 📊 工单状态

| 状态 | 说明 | 可流转到 |
|------|------|----------|
| created | 已创建 | assigned, cancelled |
| assigned | 已分派 | diagnosing, cancelled |
| diagnosing | 诊断中 | quoting, cancelled |
| quoting | 报价中 | quote_approved, cancelled |
| quote_approved | 报价已确认 | repairing, cancelled |
| repairing | 维修中 | quality_check, cancelled |
| quality_check | 待质检 | quality_passed, quality_failed |
| quality_passed | 质检通过 | delivered, cancelled |
| quality_failed | 质检不通过 | repairing, cancelled |
| delivered | 已交付 | - |
| cancelled | 已取消 | - |

## 🔌 API 接口

### 认证接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/auth/login` | 登录 | 公开 |
| POST | `/api/auth/logout` | 退出 | 已登录 |
| GET | `/api/auth/me` | 当前用户信息 | 已登录 |
| GET | `/api/auth/users` | 所有用户列表 | 已登录 |

### 工单接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/tickets` | 创建工单 | 店员 |
| GET | `/api/tickets` | 查询工单列表 | 已登录 |
| GET | `/api/tickets/queue` | 获取排队列表 | 已登录 |
| GET | `/api/tickets/counts` | 获取各状态统计 | 已登录 |
| GET | `/api/tickets/:id` | 获取工单详情 | 已登录 |
| POST | `/api/tickets/:id/assign` | 分派工单 | 店员 |
| POST | `/api/tickets/:id/accept` | 接单 | 技师 |
| POST | `/api/tickets/:id/diagnose` | 提交诊断 | 技师 |
| POST | `/api/tickets/:id/approve-quote` | 确认报价 | 店员 |
| POST | `/api/tickets/:id/repair` | 开始维修 | 技师 |
| POST | `/api/tickets/:id/submit-quality` | 提交质检 | 技师 |
| POST | `/api/tickets/:id/quality-check` | 执行质检 | 质检员 |
| POST | `/api/tickets/:id/deliver` | 交付客户 | 店员 |
| POST | `/api/tickets/:id/cancel` | 取消工单 | 店员 |
| GET | `/api/tickets/:id/logs` | 获取操作日志 | 已登录 |

## 💾 数据持久化

系统使用 SQLite 数据库，数据文件位于项目根目录：
- `repair_shop.db` - 主数据库文件
- `repair_shop.db-wal` - WAL 日志文件
- `repair_shop.db-shm` - 共享内存文件

重启服务后所有数据（工单、状态、操作历史、质检记录）都会保留。

## 🧪 验证清单

### 主链路验证
- [ ] 店员可以创建工单
- [ ] 店员可以分派工单给技师
- [ ] 技师可以接单
- [ ] 技师可以提交诊断和报价
- [ ] 店员可以确认报价
- [ ] 技师可以开始维修
- [ ] 技师可以提交质检
- [ ] 质检员可以执行质检
- [ ] 店员可以交付工单

### 失败链路验证
- [ ] 待质检状态直接交付被拒绝（必须先质检通过）
- [ ] 质检员尝试越权交付被拒绝
- [ ] 旧版本提交被冲突拦截
- [ ] 非店员角色创建工单被拒绝
- [ ] 已交付/已取消工单修改被拒绝

### 数据持久化验证
- [ ] 重启后队列顺序不变
- [ ] 重启后工单状态正确
- [ ] 重启后质检退回记录可查
- [ ] 重启后操作历史完整

### 文档一致性验证
- [ ] 运行 `npm run check:docs` 检查文档与代码一致性

## 📝 注意事项

1. 每次操作都会记录操作人姓名，便于追溯责任
2. 所有状态变更都受状态机控制，无法跳步
3. 版本号每次更新自动 +1，用于并发控制
4. 质检不通过的工单可以退回维修，返修后重新提交质检
5. 已交付和已取消的工单不可再修改

## 📄 License

MIT
