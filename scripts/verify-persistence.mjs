import assert from 'node:assert/strict'

const API_BASE = 'http://localhost:3002/api'

async function login() {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'clerk1', password: '123456' }),
  })
  const data = await res.json()
  return data.data.token
}

async function getTemplate(id, token) {
  const res = await fetch(`${API_BASE}/templates/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

async function getTemplates(token) {
  const res = await fetch(`${API_BASE}/templates`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

async function getTemplateLogs(id, token) {
  const res = await fetch(`${API_BASE}/templates/${id}/logs`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

async function verifyPersistence() {
  console.log('\n' + '='.repeat(70))
  console.log('  验证服务重启后模板数据持久化')
  console.log('='.repeat(70) + '\n')

  const token = await login()
  console.log('✓ 登录成功\n')

  const listRes = await getTemplates(token)
  console.log(`当前模板总数：${listRes.data.length}`)
  
  for (const t of listRes.data) {
    console.log(`  - #${t.id} ${t.name} (创建者: ${t.created_by_name})`)
  }
  console.log('')

  const testTemplates = listRes.data.filter(t => 
    t.name.includes('测试模板') || t.name.includes('导入测试模板')
  )

  if (testTemplates.length === 0) {
    console.log('❌ 未找到测试模板，持久化验证失败')
    process.exit(1)
  }

  for (const template of testTemplates) {
    console.log(`\n验证模板 #${template.id} - ${template.name}`)
    
    const detailRes = await getTemplate(template.id, token)
    assert.equal(detailRes.success, true, `获取模板 #${template.id} 失败`)
    assert.equal(detailRes.data.name, template.name, '模板名称不匹配')
    assert.ok(detailRes.data.fieldMapping, '字段映射不存在')
    assert.ok(detailRes.data.created_at, '创建时间不存在')
    assert.ok(detailRes.data.updated_at, '更新时间不存在')
    
    console.log(`  ✓ 模板详情正常`)
    console.log(`    - 字段映射: ${Object.keys(detailRes.data.fieldMapping).length} 个字段`)
    console.log(`    - 创建时间: ${detailRes.data.created_at}`)
    console.log(`    - 更新时间: ${detailRes.data.updated_at}`)

    const logsRes = await getTemplateLogs(template.id, token)
    assert.equal(logsRes.success, true, `获取模板 #${template.id} 日志失败`)
    assert.ok(Array.isArray(logsRes.data), '日志数据格式错误')
    
    console.log(`  ✓ 操作日志正常: 共 ${logsRes.data.length} 条记录`)
    for (const log of logsRes.data) {
      console.log(`    - ${log.created_at} ${log.operation} by ${log.operator_name}`)
    }
  }

  console.log('\n' + '='.repeat(70))
  console.log('✅ 持久化验证通过：服务重启后所有模板数据完整')
  console.log('='.repeat(70) + '\n')
}

verifyPersistence().catch(err => {
  console.error(err)
  process.exit(1)
})
