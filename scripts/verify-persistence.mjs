import assert from 'node:assert/strict'

const API_BASE = 'http://localhost:3002/api'

async function login(username, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(`Login failed: ${data.error}`)
  return data.data.token
}

async function getTicketDetail(ticketId, token) {
  const res = await fetch(`${API_BASE}/tickets/${ticketId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

async function getTicketLogs(ticketId, token) {
  const res = await fetch(`${API_BASE}/tickets/${ticketId}/logs`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

async function verifyPersistence(ticketId) {
  console.log('\n' + '='.repeat(60))
  console.log('  重启后数据持久化验证')
  console.log('='.repeat(60) + '\n')

  try {
    const healthRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test', password: 'test' }),
    })
    console.log('✓ API server is running after restart\n')
  } catch (err) {
    console.log('❌ Cannot connect to API server')
    process.exit(1)
  }

  const token = await login('clerk1', '123456')
  console.log('✓ Logged in as clerk\n')

  console.log(`正在查询工单 #${ticketId} 的交付信息...`)
  const ticketRes = await getTicketDetail(ticketId, token)
  
  if (!ticketRes.success) {
    console.log(`❌ 查询工单失败: ${ticketRes.error}`)
    process.exit(1)
  }

  const t = ticketRes.data
  console.log(`\n工单信息:`)
  console.log(`  工单编号: ${t.ticket_no}`)
  console.log(`  状态: ${t.status}`)
  console.log(`  客户: ${t.customer_name}`)
  console.log(`  设备: ${t.device_type} ${t.device_model}`)
  console.log(`  版本: v${t.version}`)

  console.log(`\n交付信息 (重启后读取):`)
  console.log(`  客户确认人: ${t.delivery_confirmer || 'MISSING!'}`)
  console.log(`  交付备注: ${t.delivery_notes || 'MISSING!'}`)
  console.log(`  回执编号: ${t.delivery_receipt_no || 'MISSING!'}`)
  console.log(`  联系电话后四位: ${t.delivery_phone_last4 || 'MISSING!'}`)
  console.log(`  交付人: ${t.delivered_by_name || 'MISSING!'}`)
  console.log(`  交付时间: ${t.delivered_at || 'MISSING!'}`)

  console.log(`\n验证字段完整性...`)
  
  try {
    assert.equal(t.status, 'delivered', '状态应为已交付')
    assert.equal(t.delivery_confirmer, '张三', '确认人应为张三')
    assert.ok(t.delivery_notes?.includes('设备已完好交付'), '备注内容不符')
    assert.equal(t.delivery_receipt_no, 'HZ20240601001', '回执编号不符')
    assert.equal(t.delivery_phone_last4, '8000', '电话后四位不符')
    assert.equal(t.delivered_by_name, '店员小王', '交付人不符')
    assert.ok(t.delivered_at, '交付时间应存在')
    assert.ok(t.delivered_by, '交付人ID应存在')
    console.log('✅ 所有交付字段验证通过！\n')
  } catch (err) {
    console.log(`❌ 字段验证失败: ${err.message}`)
    process.exit(1)
  }

  console.log(`验证操作日志...`)
  const logsRes = await getTicketLogs(ticketId, token)
  const logs = logsRes.data
  const deliverLog = logs.find(l => l.operation === '交付客户')
  
  try {
    assert.ok(deliverLog, '应存在交付操作日志')
    assert.ok(deliverLog.remark.includes('确认人：张三'), '日志应包含确认人')
    assert.ok(deliverLog.remark.includes('备注：'), '日志应包含备注')
    assert.ok(deliverLog.remark.includes('回执编号：HZ20240601001'), '日志应包含回执编号')
    assert.ok(deliverLog.remark.includes('联系电话后四位：8000'), '日志应包含电话后四位')
    console.log('✅ 操作日志验证通过！')
    console.log(`   日志内容: ${deliverLog.remark}\n`)
  } catch (err) {
    console.log(`❌ 日志验证失败: ${err.message}`)
    process.exit(1)
  }

  console.log('='.repeat(60))
  console.log('  ✅ 持久化验证全部通过！')
  console.log('  重启后所有交付字段和操作日志均正确读取')
  console.log('='.repeat(60) + '\n')
}

const ticketId = process.argv[2] || '22'
verifyPersistence(ticketId).catch(console.error)
