import assert from 'node:assert/strict'
import { setTimeout } from 'node:timers/promises'

const API_BASE = 'http://localhost:3002/api'

const users = {
  clerk: { username: 'clerk1', password: '123456' },
  technician: { username: 'tech1', password: '123456' },
  inspector: { username: 'inspector1', password: '123456' },
}

const tokens = {}

async function login(role) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(users[role]),
  })
  const data = await res.json()
  if (!data.success) throw new Error(`Login failed for ${role}: ${data.error}`)
  tokens[role] = data.data.token
  console.log(`✓ ${role} logged in`)
  return tokens[role]
}

async function request(path, options = {}, role = 'clerk') {
  const token = tokens[role]
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  return res.json()
}

function test(name, fn) {
  return async () => {
    try {
      await fn()
      console.log(`✅ PASS: ${name}`)
      return true
    } catch (err) {
      console.log(`❌ FAIL: ${name}`)
      console.log(`   Error: ${err.message}`)
      return false
    }
  }
}

const tests = [
  test('Login all users', async () => {
    await login('clerk')
    await login('technician')
    await login('inspector')
  }),

  test('Create ticket (clerk)', async () => {
    const res = await request('/tickets', {
      method: 'POST',
      body: JSON.stringify({
        customerName: '张三',
        customerPhone: '13800138000',
        deviceType: '手机',
        deviceModel: 'iPhone 15',
        faultDescription: '屏幕破碎',
        priority: 'high',
      }),
    }, 'clerk')
    assert.equal(res.success, true, res.error)
    assert.ok(res.data.id, 'Ticket ID should exist')
    global.ticketId = res.data.id
    global.ticketVersion = res.data.version
  }),

  test('Assign ticket to technician (clerk)', async () => {
    const res = await request(`/tickets/${global.ticketId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assigneeId: 2, version: global.ticketVersion }),
    }, 'clerk')
    assert.equal(res.success, true, res.error)
    global.ticketVersion = res.data.version
  }),

  test('Accept ticket (technician)', async () => {
    const res = await request(`/tickets/${global.ticketId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ version: global.ticketVersion }),
    }, 'technician')
    assert.equal(res.success, true, res.error)
    global.ticketVersion = res.data.version
  }),

  test('Submit diagnosis (technician)', async () => {
    const res = await request(`/tickets/${global.ticketId}/diagnose`, {
      method: 'POST',
      body: JSON.stringify({
        diagnosisResult: '屏幕破碎，需要更换屏幕总成',
        estimatedCost: 1299,
        version: global.ticketVersion,
      }),
    }, 'technician')
    assert.equal(res.success, true, res.error)
    global.ticketVersion = res.data.version
  }),

  test('Approve quote (clerk)', async () => {
    const res = await request(`/tickets/${global.ticketId}/approve-quote`, {
      method: 'POST',
      body: JSON.stringify({ version: global.ticketVersion }),
    }, 'clerk')
    assert.equal(res.success, true, res.error)
    global.ticketVersion = res.data.version
  }),

  test('Start repair (technician)', async () => {
    const res = await request(`/tickets/${global.ticketId}/repair`, {
      method: 'POST',
      body: JSON.stringify({ version: global.ticketVersion }),
    }, 'technician')
    assert.equal(res.success, true, res.error)
    global.ticketVersion = res.data.version
  }),

  test('Submit quality check (technician)', async () => {
    const res = await request(`/tickets/${global.ticketId}/submit-quality`, {
      method: 'POST',
      body: JSON.stringify({
        repairDetails: '已更换原厂屏幕总成，测试触摸、显示、面容均正常',
        actualCost: 1299,
        version: global.ticketVersion,
      }),
    }, 'technician')
    assert.equal(res.success, true, res.error)
    global.ticketVersion = res.data.version
  }),

  test('Quality check pass (inspector)', async () => {
    const res = await request(`/tickets/${global.ticketId}/quality-check`, {
      method: 'POST',
      body: JSON.stringify({
        passed: true,
        comment: '质检合格，维修质量良好',
        version: global.ticketVersion,
      }),
    }, 'inspector')
    assert.equal(res.success, true, res.error)
    assert.equal(res.data.status, 'quality_passed')
    global.ticketVersion = res.data.version
  }),

  test('BLOCK: Technician cannot deliver (越权测试)', async () => {
    const res = await request(`/tickets/${global.ticketId}/deliver`, {
      method: 'POST',
      body: JSON.stringify({
        version: global.ticketVersion,
        confirmer: '张三',
        notes: '设备完好交付',
      }),
    }, 'technician')
    assert.equal(res.success, false, 'Should fail for technician')
    assert.ok(res.error.includes('权限不足') || res.error.includes('越权'), `Error should mention permission: ${res.error}`)
  }),

  test('BLOCK: Inspector cannot deliver (越权测试)', async () => {
    const res = await request(`/tickets/${global.ticketId}/deliver`, {
      method: 'POST',
      body: JSON.stringify({
        version: global.ticketVersion,
        confirmer: '张三',
        notes: '设备完好交付',
      }),
    }, 'inspector')
    assert.equal(res.success, false, 'Should fail for inspector')
    assert.ok(res.error.includes('权限不足') || res.error.includes('越权'), `Error should mention permission: ${res.error}`)
  }),

  test('BLOCK: Deliver without confirmer (字段验证)', async () => {
    const res = await request(`/tickets/${global.ticketId}/deliver`, {
      method: 'POST',
      body: JSON.stringify({
        version: global.ticketVersion,
        confirmer: '',
        notes: '设备完好交付',
      }),
    }, 'clerk')
    assert.equal(res.success, false, 'Should fail without confirmer')
  }),

  test('BLOCK: Deliver without notes (字段验证)', async () => {
    const res = await request(`/tickets/${global.ticketId}/deliver`, {
      method: 'POST',
      body: JSON.stringify({
        version: global.ticketVersion,
        confirmer: '张三',
        notes: '',
      }),
    }, 'clerk')
    assert.equal(res.success, false, 'Should fail without notes')
  }),

  test('BLOCK: Deliver with invalid phoneLast4 (格式验证)', async () => {
    const res = await request(`/tickets/${global.ticketId}/deliver`, {
      method: 'POST',
      body: JSON.stringify({
        version: global.ticketVersion,
        confirmer: '张三',
        notes: '设备完好交付',
        phoneLast4: 'abcd',
      }),
    }, 'clerk')
    assert.equal(res.success, false, 'Should fail with invalid phoneLast4')
    assert.ok(res.error.includes('4位数字'), `Error should mention 4 digits: ${res.error}`)
  }),

  test('SUCCESS: Deliver with all fields (clerk)', async () => {
    const res = await request(`/tickets/${global.ticketId}/deliver`, {
      method: 'POST',
      body: JSON.stringify({
        version: global.ticketVersion,
        confirmer: '张三',
        notes: '设备已完好交付，客户确认无问题。屏幕显示、触摸、面容均正常。',
        receiptNo: 'HZ20240601001',
        phoneLast4: '8000',
      }),
    }, 'clerk')
    assert.equal(res.success, true, res.error)
    assert.equal(res.data.status, 'delivered')
    assert.equal(res.data.delivery_confirmer, '张三')
    assert.equal(res.data.delivery_receipt_no, 'HZ20240601001')
    assert.equal(res.data.delivery_phone_last4, '8000')
    assert.ok(res.data.delivered_at, 'delivered_at should be set')
    assert.ok(res.data.delivered_by, 'delivered_by should be set')
    global.ticketVersion = res.data.version
    console.log(`   交付信息已保存：确认人=${res.data.delivery_confirmer}, 回执编号=${res.data.delivery_receipt_no}`)
  }),

  test('BLOCK: Deliver with old version (版本冲突测试)', async () => {
    const createRes = await request('/tickets', {
      method: 'POST',
      body: JSON.stringify({
        customerName: '王五',
        customerPhone: '13700137000',
        deviceType: '笔记本',
        deviceModel: 'MacBook Pro',
        faultDescription: '键盘失灵',
        priority: 'low',
      }),
    }, 'clerk')
    const vcTicketId = createRes.data.id
    let vcVersion = createRes.data.version

    const assignRes = await request(`/tickets/${vcTicketId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assigneeId: 2, version: vcVersion }),
    }, 'clerk')
    vcVersion = assignRes.data.version

    const acceptRes = await request(`/tickets/${vcTicketId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ version: vcVersion }),
    }, 'technician')
    vcVersion = acceptRes.data.version

    const diagRes = await request(`/tickets/${vcTicketId}/diagnose`, {
      method: 'POST',
      body: JSON.stringify({
        diagnosisResult: '键盘进液，需要更换键盘',
        estimatedCost: 800,
        version: vcVersion,
      }),
    }, 'technician')
    vcVersion = diagRes.data.version

    const approveRes = await request(`/tickets/${vcTicketId}/approve-quote`, {
      method: 'POST',
      body: JSON.stringify({ version: vcVersion }),
    }, 'clerk')
    vcVersion = approveRes.data.version

    const repairRes = await request(`/tickets/${vcTicketId}/repair`, {
      method: 'POST',
      body: JSON.stringify({ version: vcVersion }),
    }, 'technician')
    vcVersion = repairRes.data.version

    const submitQcRes = await request(`/tickets/${vcTicketId}/submit-quality`, {
      method: 'POST',
      body: JSON.stringify({
        repairDetails: '已更换键盘，所有按键测试正常',
        actualCost: 800,
        version: vcVersion,
      }),
    }, 'technician')
    vcVersion = submitQcRes.data.version

    const qcRes = await request(`/tickets/${vcTicketId}/quality-check`, {
      method: 'POST',
      body: JSON.stringify({
        passed: true,
        comment: '质检合格',
        version: vcVersion,
      }),
    }, 'inspector')
    const currentVersion = qcRes.data.version
    const oldVersion = currentVersion - 1

    const res = await request(`/tickets/${vcTicketId}/deliver`, {
      method: 'POST',
      body: JSON.stringify({
        version: oldVersion,
        confirmer: '王五',
        notes: '尝试用旧版本交付',
      }),
    }, 'clerk')
    assert.equal(res.success, false, 'Should fail with old version')
    assert.ok(res.error.includes('版本冲突') || res.error.includes('VERSION_CONFLICT'), `Error should mention version conflict: ${res.error}`)
    console.log(`   版本冲突拦截成功，旧版本 v${oldVersion} 被拒绝，当前版本 v${currentVersion}`)
  }),

  test('BLOCK: Deliver from wrong status (skip QC test)', async () => {
    const createRes = await request('/tickets', {
      method: 'POST',
      body: JSON.stringify({
        customerName: '李四',
        customerPhone: '13900139000',
        deviceType: '平板',
        deviceModel: 'iPad Pro',
        faultDescription: '电池不充电',
        priority: 'medium',
      }),
    }, 'clerk')
    const newTicketId = createRes.data.id
    const newTicketVersion = createRes.data.version

    const res = await request(`/tickets/${newTicketId}/deliver`, {
      method: 'POST',
      body: JSON.stringify({
        version: newTicketVersion,
        confirmer: '李四',
        notes: '尝试跳过质检直接交付',
      }),
    }, 'clerk')
    assert.equal(res.success, false, 'Should fail without QC pass')
    assert.ok(res.error.includes('状态不允许') || res.error.includes('质检'), `Error should mention status/QC: ${res.error}`)
    console.log(`   跳过质检拦截成功，状态为「${createRes.data.status}」不能交付`)
  }),

  test('Verify delivery info in ticket detail', async () => {
    const res = await request(`/tickets/${global.ticketId}`, {}, 'clerk')
    assert.equal(res.success, true, res.error)
    const t = res.data
    assert.equal(t.delivery_confirmer, '张三')
    assert.equal(t.delivery_notes, '设备已完好交付，客户确认无问题。屏幕显示、触摸、面容均正常。')
    assert.equal(t.delivery_receipt_no, 'HZ20240601001')
    assert.equal(t.delivery_phone_last4, '8000')
    assert.ok(t.delivered_at, 'delivered_at should exist')
    assert.ok(t.delivered_by_name, 'delivered_by_name should exist')
    console.log(`   详情页交付信息正确：确认人=${t.delivery_confirmer}, 交付人=${t.delivered_by_name}`)
  }),

  test('Verify delivery info in operation logs', async () => {
    const res = await request(`/tickets/${global.ticketId}/logs`, {}, 'clerk')
    assert.equal(res.success, true, res.error)
    const logs = res.data
    const deliverLog = logs.find(l => l.operation === '交付客户')
    assert.ok(deliverLog, 'Should have deliver log')
    assert.ok(deliverLog.remark.includes('确认人：张三'), `Log remark should include confirmer: ${deliverLog.remark}`)
    assert.ok(deliverLog.remark.includes('备注：'), `Log remark should include notes: ${deliverLog.remark}`)
    assert.ok(deliverLog.remark.includes('回执编号：HZ20240601001'), `Log remark should include receiptNo: ${deliverLog.remark}`)
    assert.ok(deliverLog.remark.includes('联系电话后四位：8000'), `Log remark should include phoneLast4: ${deliverLog.remark}`)
    console.log(`   操作日志正确：${deliverLog.remark}`)
  }),

  test('PERSISTENCE: Verify delivery data survives (读取已存在数据)', async () => {
    const res = await request(`/tickets/${global.ticketId}`, {}, 'clerk')
    assert.equal(res.success, true, res.error)
    const t = res.data
    assert.equal(t.status, 'delivered')
    assert.equal(t.delivery_confirmer, '张三')
    assert.equal(t.delivery_receipt_no, 'HZ20240601001')
    console.log(`   持久化验证通过：工单 #${t.ticket_no} 交付信息完整`)
    console.log(`   请重启服务后再次运行脚本，验证数据仍然存在`)
    global.ticketNoForPersistence = t.ticket_no
  }),
]

async function runTests() {
  console.log('\n' + '='.repeat(60))
  console.log('  工单交付确认功能 - 综合测试套件')
  console.log('='.repeat(60) + '\n')

  try {
    const healthRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test', password: 'test' }),
    })
    if (healthRes.status !== 200 && healthRes.status !== 401 && healthRes.status !== 400) {
      throw new Error(`Server not responding, status: ${healthRes.status}`)
    }
    console.log('✓ API server is running\n')
  } catch (err) {
    console.log('❌ Cannot connect to API server')
    console.log('   Please start the server with: cd api && npm run dev')
    console.log(`   Error: ${err.message}`)
    process.exit(1)
  }

  let passed = 0
  let failed = 0

  for (const t of tests) {
    const result = await t()
    if (result) passed++
    else failed++
    await setTimeout(100)
  }

  console.log('\n' + '='.repeat(60))
  console.log(`  测试结果: ${passed} 通过, ${failed} 失败`)
  console.log('='.repeat(60))

  if (failed > 0) {
    process.exit(1)
  }

  console.log('\n📋 持久化验证提示：')
  console.log(`   工单编号: ${global.ticketNoForPersistence}`)
  console.log(`   工单ID: ${global.ticketId}`)
  console.log(`   请重启后端服务后，可通过详情页或重新运行脚本验证数据仍然存在`)
}

runTests().catch(console.error)
